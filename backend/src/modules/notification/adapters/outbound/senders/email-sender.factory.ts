import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { Resend } from 'resend';
import { EmailSenderPort } from '../../../application/ports/outbound/senders/email-sender.port.js';
import { ResendEmailSender } from './resend-email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

// Sem domínio verificado, o Resend só aceita este remetente (e só entrega para o dono da conta).
export const DEFAULT_EMAIL_FROM = 'Bilheteria <onboarding@resend.dev>';

/**
 * EMAIL_DRIVER escolhe o provedor:
 *   smtp   (padrão) Mailpit do compose em dev, ou qualquer SMTP (SMTP_HOST/SMTP_PORT)
 *   resend          API do Resend (RESEND_API_KEY obrigatória)
 */
export function createEmailSender(config: ConfigService): EmailSenderPort {
  const driver = config.get<string>('EMAIL_DRIVER') || 'smtp';
  const from = config.get<string>('EMAIL_FROM') || DEFAULT_EMAIL_FROM;
  switch (driver) {
    case 'resend':
      return new ResendEmailSender(
        new Resend(config.getOrThrow<string>('RESEND_API_KEY')),
        from,
      );
    case 'smtp':
      return new SmtpEmailSender(
        createTransport({
          host: config.get<string>('SMTP_HOST') || 'localhost',
          port: Number(config.get<string>('SMTP_PORT') || 1025),
          secure: false,
        }),
        from,
      );
    default:
      throw new Error(
        `EMAIL_DRIVER inválido: "${driver}" (use smtp ou resend)`,
      );
  }
}
