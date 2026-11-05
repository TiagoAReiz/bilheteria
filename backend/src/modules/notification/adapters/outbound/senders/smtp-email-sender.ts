import type { Transporter } from 'nodemailer';
import {
  EmailSendError,
  EmailSenderPort,
  OutgoingEmail,
} from '../../../application/ports/outbound/senders/email-sender.port.js';

/**
 * Envio por SMTP. Em dev aponta para o Mailpit do compose (localhost:1025), que guarda tudo
 * numa caixa de entrada web (localhost:8025) sem entregar a ninguém de verdade.
 */
export class SmtpEmailSender implements EmailSenderPort {
  readonly provider = 'smtp';

  constructor(
    private readonly transport: Pick<Transporter, 'sendMail'>,
    private readonly from: string,
  ) {}

  async send(
    email: OutgoingEmail,
  ): Promise<{ providerMessageId: string | null }> {
    try {
      const info = await this.transport.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: { 'Idempotency-Key': email.idempotencyKey },
      });
      return { providerMessageId: info.messageId ?? null };
    } catch (error) {
      const code = (error as { responseCode?: number }).responseCode;
      // 5xx do SMTP é recusa definitiva; o resto (conexão, 4xx) tenta de novo
      throw new EmailSendError(
        `SMTP recusou: ${(error as Error).message}`,
        code !== undefined && code >= 500,
      );
    }
  }
}
