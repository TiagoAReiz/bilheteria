import type { Mock } from 'vitest';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { EmailOutboxRepository } from '../../../../../../src/modules/notification/adapters/outbound/repositories/email-outbox.repository.js';
import { enqueueEmail } from '../../../../../../src/modules/notification/adapters/outbound/outbox/enqueue-email.js';
import { ticketConfirmedEmail } from '../../../../../../src/modules/notification/core/entities/email.js';

type RawCall = [TemplateStringsArray, ...unknown[]];
const sqlOf = (call: RawCall) => call[0].join('?').replace(/\s+/g, ' ').trim();

const DATA = {
  userName: 'Maria',
  eventId: 1,
  eventName: 'Show',
  eventStartsAt: '2026-06-20T23:00:00.000Z',
  eventLocation: 'Arena',
  ticketId: 7,
  amountCents: 5000,
  currency: 'BRL',
};

describe('EmailOutboxRepository', () => {
  let prisma: { $queryRaw: Mock; email_outbox: { update: Mock } };
  let repository: EmailOutboxRepository;

  beforeEach(() => {
    prisma = { $queryRaw: vi.fn(), email_outbox: { update: vi.fn() } };
    repository = new EmailOutboxRepository(prisma as unknown as PrismaService);
  });

  it('claimDue reserva com SKIP LOCKED, conta a tentativa e aplica o lease num UPDATE só', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'mail-1',
        kind: 'ticket_confirmed',
        dedupe_key: 'ticket-confirmed:pay-1',
        to_email: 'm@example.com',
        payload: DATA,
        attempts: 1,
      },
    ]);

    await expect(repository.claimDue(20, 300_000)).resolves.toEqual([
      {
        id: 'mail-1',
        attempts: 1,
        kind: 'ticket_confirmed',
        to: 'm@example.com',
        dedupeKey: 'ticket-confirmed:pay-1',
        data: DATA,
      },
    ]);
    const [call] = prisma.$queryRaw.mock.calls as RawCall[];
    const sql = sqlOf(call);
    expect(sql).toMatch(/^UPDATE email_outbox SET attempts = attempts \+ 1/);
    expect(sql).toMatch(
      /WHERE status = 'pending' AND next_attempt_at <= NOW\(\)/,
    );
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(call.slice(1)).toEqual([300, 20]);
  });

  it('markSent grava status, horário e id do provedor', async () => {
    await repository.markSent('mail-1', 'msg-1');
    expect(prisma.email_outbox.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: {
        status: 'sent',
        sent_at: expect.any(Date),
        provider_message_id: 'msg-1',
        last_error: null,
      },
    });
  });

  it('scheduleRetry guarda o erro truncado', async () => {
    const next = new Date('2026-06-15T12:00:30.000Z');
    await repository.scheduleRetry('mail-1', next, 'x'.repeat(5000));
    const [{ data }] = prisma.email_outbox.update.mock.calls[0] as [
      { data: { next_attempt_at: Date; last_error: string } },
    ];
    expect(data.next_attempt_at).toBe(next);
    expect(data.last_error.length).toBe(1001);
  });

  it('markFailed encerra o email', async () => {
    await repository.markFailed('mail-1', 'remetente inválido');
    expect(prisma.email_outbox.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: { status: 'failed', last_error: 'remetente inválido' },
    });
  });
});

describe('enqueueEmail', () => {
  it('grava na transação recebida e ignora fato repetido (skipDuplicates)', async () => {
    const tx = {
      email_outbox: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    await enqueueEmail(
      tx as never,
      ticketConfirmedEmail('pay-1', 'm@example.com', DATA),
    );

    expect(tx.email_outbox.createMany).toHaveBeenCalledWith({
      data: [
        {
          kind: 'ticket_confirmed',
          dedupe_key: 'ticket-confirmed:pay-1',
          to_email: 'm@example.com',
          payload: DATA,
        },
      ],
      skipDuplicates: true,
    });
  });
});
