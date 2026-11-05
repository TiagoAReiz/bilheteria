import { OutboxEmail } from '../../../../core/entities/email.js';

export const EMAIL_OUTBOX_REPOSITORY = Symbol('EMAIL_OUTBOX_REPOSITORY');

export interface EmailOutboxRepositoryPort {
  /**
   * Reserva até `limit` emails vencidos (pendentes com next_attempt_at <= agora): conta a
   * tentativa e empurra next_attempt_at para depois do lease. Dois workers nunca pegam a
   * mesma linha (SKIP LOCKED); se o processo cair no meio do envio, ela volta após o lease.
   */
  claimDue(limit: number, leaseMs: number): Promise<OutboxEmail[]>;
  markSent(id: string, providerMessageId: string | null): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}
