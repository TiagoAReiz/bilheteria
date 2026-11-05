import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { EmailOutboxRepositoryPort } from '../../../application/ports/outbound/repositories/email-outbox.repository.port.js';
import { EmailRequest, OutboxEmail } from '../../../core/entities/email.js';

type ClaimedRow = {
  id: string;
  kind: string;
  dedupe_key: string;
  to_email: string;
  payload: unknown;
  attempts: number;
};

// erro do provedor pode ser longo (HTML de uma página de erro); guarda só o começo
const MAX_ERROR_LENGTH = 1000;

@Injectable()
export class EmailOutboxRepository implements EmailOutboxRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async claimDue(limit: number, leaseMs: number): Promise<OutboxEmail[]> {
    // um único UPDATE: reserva (SKIP LOCKED), conta a tentativa e esconde a linha pelo lease
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
            UPDATE email_outbox
            SET attempts = attempts + 1,
                next_attempt_at = NOW() + make_interval(secs => ${leaseMs / 1000}),
                updated_at = NOW()
            WHERE id IN (
                SELECT id FROM email_outbox
                WHERE status = 'pending' AND next_attempt_at <= NOW()
                ORDER BY next_attempt_at
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, kind, dedupe_key, to_email, payload, attempts`;
    return rows.map(toOutboxEmail);
  }

  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    await this.prisma.email_outbox.update({
      where: { id },
      data: {
        status: 'sent',
        sent_at: new Date(),
        provider_message_id: providerMessageId,
        last_error: null,
      },
    });
  }

  async scheduleRetry(
    id: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<void> {
    await this.prisma.email_outbox.update({
      where: { id },
      data: { next_attempt_at: nextAttemptAt, last_error: truncate(error) },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.email_outbox.update({
      where: { id },
      data: { status: 'failed', last_error: truncate(error) },
    });
  }
}

// kind e payload foram gravados juntos por enqueueEmail a partir de um EmailRequest válido
function toOutboxEmail(row: ClaimedRow): OutboxEmail {
  return {
    id: row.id,
    attempts: row.attempts,
    kind: row.kind as EmailRequest['kind'],
    to: row.to_email,
    dedupeKey: row.dedupe_key,
    data: row.payload as EmailRequest['data'],
  };
}

function truncate(error: string): string {
  return error.length > MAX_ERROR_LENGTH
    ? `${error.slice(0, MAX_ERROR_LENGTH)}…`
    : error;
}
