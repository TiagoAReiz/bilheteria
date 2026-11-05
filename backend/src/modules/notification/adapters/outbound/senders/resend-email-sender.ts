import { Resend } from 'resend';
import {
  EmailSendError,
  EmailSenderPort,
  OutgoingEmail,
} from '../../../application/ports/outbound/senders/email-sender.port.js';

// Códigos do Resend que não melhoram repetindo: configuração ou destinatário errados.
// Os demais (rate_limit_exceeded, daily_quota_exceeded, internal_server_error...) são temporários.
const PERMANENT_ERRORS = new Set([
  'validation_error',
  'missing_api_key',
  'restricted_api_key',
  'invalid_api_key',
  'invalid_from_address',
  'invalid_access',
  'invalid_parameter',
  'missing_required_field',
  'invalid_idempotency_key',
  'invalid_idempotent_request',
  'invalid_attachment',
]);

/**
 * Envio pelo Resend. Sem domínio verificado só funciona com `from` em onboarding@resend.dev
 * e para o email da própria conta do Resend (outros destinatários recebem 403).
 */
export class ResendEmailSender implements EmailSenderPort {
  readonly provider = 'resend';

  constructor(
    private readonly client: Pick<Resend, 'emails'>,
    private readonly from: string,
  ) {}

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    let response: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      response = await this.client.emails.send(
        {
          from: this.from,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        },
        { idempotencyKey: email.idempotencyKey },
      );
    } catch (error) {
      // rede/timeout: o SDK lança em vez de devolver `error`
      throw new EmailSendError(
        `Resend inacessível: ${(error as Error).message}`,
        false,
      );
    }
    if (response.error) {
      const { name, message, statusCode } = response.error;
      throw new EmailSendError(
        `Resend recusou (${statusCode ?? '?'} ${name}): ${message}`,
        PERMANENT_ERRORS.has(name) || statusCode === 403,
      );
    }
    return { providerMessageId: response.data.id };
  }
}
