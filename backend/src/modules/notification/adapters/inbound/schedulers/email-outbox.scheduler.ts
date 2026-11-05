import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  EMAIL_DISPATCH_SERVICE,
  type EmailDispatchServicePort,
} from '../../../application/ports/inbound/services/email-dispatch.service.port.js';

export const EMAIL_OUTBOX_JOB = 'email-outbox-dispatch';
export const DEFAULT_EMAIL_DISPATCH_INTERVAL_MS = 5_000;

// adapter inbound disparado pelo relógio: a cada tick envia um lote da outbox
@Injectable()
export class EmailOutboxScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailOutboxScheduler.name);
  private running = false;

  constructor(
    @Inject(EMAIL_DISPATCH_SERVICE)
    private readonly dispatch: EmailDispatchServicePort,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const intervalMs = this.intervalMs();
    if (intervalMs <= 0) {
      this.logger.log(
        'Envio de emails desligado (EMAIL_DISPATCH_INTERVAL_MS=0)',
      );
      return;
    }
    this.schedulerRegistry.addInterval(
      EMAIL_OUTBOX_JOB,
      setInterval(() => void this.tick(), intervalMs),
    );
  }

  onApplicationShutdown() {
    if (this.schedulerRegistry.doesExist('interval', EMAIL_OUTBOX_JOB)) {
      this.schedulerRegistry.deleteInterval(EMAIL_OUTBOX_JOB);
    }
  }

  // nunca lança: banco fora só registra log e o próximo tick tenta de novo
  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const { sent, retried, failed } = await this.dispatch.dispatchDue();
      if (sent + retried + failed > 0) {
        this.logger.log(
          `Emails: ${sent} enviado(s), ${retried} para nova tentativa, ${failed} desistido(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Falha ao processar a outbox de emails: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  private intervalMs(): number {
    const raw = this.config.get<string>('EMAIL_DISPATCH_INTERVAL_MS');
    if (raw === undefined || raw === '') {
      return DEFAULT_EMAIL_DISPATCH_INTERVAL_MS;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(
        `EMAIL_DISPATCH_INTERVAL_MS inválido: "${raw}" (use milissegundos; 0 desliga)`,
      );
    }
    return parsed;
  }
}
