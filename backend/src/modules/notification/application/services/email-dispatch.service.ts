import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DispatchSummary,
  EmailDispatchServicePort,
} from '../ports/inbound/services/email-dispatch.service.port.js';
import {
  EMAIL_OUTBOX_REPOSITORY,
  type EmailOutboxRepositoryPort,
} from '../ports/outbound/repositories/email-outbox.repository.port.js';
import {
  EMAIL_RENDERER,
  type EmailRendererPort,
} from '../ports/outbound/renderers/email-renderer.port.js';
import {
  EMAIL_SENDER,
  EmailSendError,
  type EmailSenderPort,
} from '../ports/outbound/senders/email-sender.port.js';
import {
  EMAIL_METRICS,
  type EmailMetricsPort,
} from '../ports/outbound/metrics/email-metrics.port.js';
import { OutboxEmail } from '../../core/entities/email.js';
import {
  EMAIL_CLAIM_LEASE_MS,
  decideAfterFailure,
} from '../../core/entities/email-retry.js';

export const EMAIL_BATCH_SIZE = 20;

@Injectable()
export class EmailDispatchService implements EmailDispatchServicePort {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(
    @Inject(EMAIL_OUTBOX_REPOSITORY)
    private readonly outbox: EmailOutboxRepositoryPort,
    @Inject(EMAIL_RENDERER) private readonly renderer: EmailRendererPort,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSenderPort,
    @Inject(EMAIL_METRICS) private readonly metrics: EmailMetricsPort,
  ) {}

  async dispatchDue(): Promise<DispatchSummary> {
    const summary: DispatchSummary = { sent: 0, retried: 0, failed: 0 };
    const due = await this.outbox.claimDue(
      EMAIL_BATCH_SIZE,
      EMAIL_CLAIM_LEASE_MS,
    );
    // um por vez: o plano grátis do Resend limita a taxa, e um lote pequeno não precisa de paralelismo
    for (const email of due) {
      const outcome = await this.deliver(email);
      if (outcome === 'sent') summary.sent++;
      else if (outcome === 'retry') summary.retried++;
      else summary.failed++;
      this.metrics.emailProcessed(email.kind, outcome);
    }
    return summary;
  }

  private async deliver(
    email: OutboxEmail,
  ): Promise<'sent' | 'retry' | 'failed'> {
    try {
      const rendered = await this.renderer.render(email);
      const { providerMessageId } = await this.sender.send({
        ...rendered,
        to: email.to,
        idempotencyKey: email.dedupeKey,
      });
      await this.outbox.markSent(email.id, providerMessageId);
      return 'sent';
    } catch (error) {
      // erro de template ou de código também é permanente: repetir daria o mesmo resultado
      const permanent = !(error instanceof EmailSendError) || error.permanent;
      const message = (error as Error).message;
      const decision = decideAfterFailure(
        email.attempts,
        permanent,
        new Date(),
      );
      if (decision.status === 'failed') {
        await this.outbox.markFailed(email.id, message);
        this.logger.error(
          `Email ${email.id} (${email.kind}) desistido após ${email.attempts} tentativa(s): ${message}`,
        );
        return 'failed';
      }
      await this.outbox.scheduleRetry(
        email.id,
        decision.nextAttemptAt,
        message,
      );
      this.logger.warn(
        `Email ${email.id} (${email.kind}) falhou na tentativa ${email.attempts}; nova tentativa em ${decision.nextAttemptAt.toISOString()}: ${message}`,
      );
      return 'retry';
    }
  }
}
