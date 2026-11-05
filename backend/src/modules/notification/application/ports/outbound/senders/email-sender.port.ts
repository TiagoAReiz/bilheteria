import { RenderedEmail } from '../../../../core/entities/email.js';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  /** Mesmo valor em todas as tentativas do mesmo email: o provedor descarta a repetição. */
  idempotencyKey: string;
}

/** Erro do envio; `permanent` diz se vale tentar de novo. */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export interface EmailSenderPort {
  /** Nome do provedor (métricas e logs). */
  readonly provider: string;
  /** Entrega ao provedor; lança EmailSendError quando ele recusa. */
  send(email: OutgoingEmail): Promise<{ providerMessageId: string | null }>;
}
