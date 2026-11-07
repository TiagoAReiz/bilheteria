import type { Mock } from 'vitest';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { PaymentRepository } from '../../../../../../src/modules/payment/adapters/outbound/repositories/payment.repository.js';
import { RESERVATION_TTL_MINUTES } from '../../../../../../src/modules/ticket/core/entities/reservation.entity.js';
import type { Payment } from '../../../../../../src/modules/payment/core/entities/payment.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const RESERVED_AT = new Date(NOW.getTime() - 60_000);
const DEADLINE = new Date(
  RESERVED_AT.getTime() + RESERVATION_TTL_MINUTES * 60_000,
);
const PAYMENT_ID = '0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const IDS = { providerOrderId: 'ORD1', providerPaymentId: 'PAY1' };
const CHARGED = { amountCents: 5000, currency: 'BRL' };

type RawCall = [TemplateStringsArray, ...unknown[]];
const sqlOf = (call: RawCall) => call[0].join('?').replace(/\s+/g, ' ').trim();
const valuesOf = (call: RawCall) => call.slice(1);

const ticketRow = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  user_id: 'user-1',
  reserved_at: RESERVED_AT,
  is_paid: false,
  event_id: 10,
  event_name: 'Show',
  price_cents: 5000,
  event_starts_at: new Date(NOW.getTime() + 86_400_000),
  event_sales_starts_at: null,
  event_deleted: false,
  now: NOW,
  ...overrides,
});

const paymentRow = (overrides: Partial<Payment> = {}): Payment => ({
  id: PAYMENT_ID,
  ticket_id: 7,
  user_id: 'user-1',
  amount_cents: 5000,
  currency: 'BRL',
  status: 'pending',
  provider: 'mercadopago',
  provider_order_id: 'ORD1',
  provider_payment_id: null,
  checkout_url:
    'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1',
  expires_at: DEADLINE,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

describe('PaymentRepository', () => {
  let tx: {
    $queryRaw: Mock;
    $executeRaw: Mock;
    payment: {
      findMany: Mock;
      findUnique: Mock;
      updateMany: Mock;
      create: Mock;
      update: Mock;
    };
    ticket: { findUnique: Mock };
    email_outbox: { createMany: Mock };
  };
  let prisma: {
    $transaction: Mock;
    payment: { findUnique: Mock; updateMany: Mock };
  };
  let repository: PaymentRepository;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ ticket_id: 7 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(async ({ data }: { data: Partial<Payment> }) =>
          paymentRow({ ...data, provider_order_id: null, checkout_url: null }),
        ),
        update: vi.fn(async ({ data }: { data: Partial<Payment> }) =>
          paymentRow(data),
        ),
      },
      ticket: {
        findUnique: vi.fn().mockResolvedValue({
          event: {
            id: 10,
            name: 'Show',
            starts_at: new Date('2026-06-20T23:00:00.000Z'),
            location: 'Arena',
          },
          user: { email: 'comprador@example.com', name: 'Maria Souza' },
        }),
      },
      email_outbox: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) =>
        callback(tx),
      ),
      payment: {
        findUnique: vi.fn().mockResolvedValue(paymentRow()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repository = new PaymentRepository(prisma as unknown as PrismaService);
  });

  describe('openCheckout', () => {
    const input = {
      ticketId: 7,
      userId: 'user-1',
      provider: 'mercadopago',
      currency: 'BRL',
    };

    it('trava o ticket (FOR UPDATE OF t) e usa o relógio do Postgres', async () => {
      tx.$queryRaw.mockResolvedValueOnce([ticketRow()]);

      await repository.openCheckout(input);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [lock] = tx.$queryRaw.mock.calls as RawCall[];
      expect(sqlOf(lock)).toMatch(/FROM ticket AS t JOIN event AS e/);
      expect(sqlOf(lock)).toMatch(/NOW\(\) AS now/);
      expect(sqlOf(lock)).toMatch(/FOR UPDATE OF t$/);
      expect(valuesOf(lock)).toEqual([7]);
    });

    it('cria um pendente com o preço do evento e o fim da reserva, expirando os pendentes antigos antes', async () => {
      tx.$queryRaw.mockResolvedValueOnce([ticketRow()]);

      const result = await repository.openCheckout(input);

      expect(result).toMatchObject({
        outcome: 'created',
        payment: { status: 'pending', amount_cents: 5000 },
      });
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { ticket_id: 7, status: 'pending' },
        data: { status: 'expired' },
      });
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          ticket_id: 7,
          user_id: 'user-1',
          amount_cents: 5000,
          currency: 'BRL',
          status: 'pending',
          provider: 'mercadopago',
          expires_at: DEADLINE,
        },
      });
      // a expiração dos antigos vem antes do insert (índice único de pendente por ticket)
      expect(tx.payment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.payment.create.mock.invocationCallOrder[0],
      );
    });

    it('reaproveita o pendente da mesma reserva sem criar outro', async () => {
      tx.$queryRaw.mockResolvedValueOnce([ticketRow()]);
      tx.payment.findMany.mockResolvedValue([paymentRow()]);

      await expect(repository.openCheckout(input)).resolves.toMatchObject({
        outcome: 'reused',
        payment: { id: PAYMENT_ID },
      });
      expect(tx.payment.create).not.toHaveBeenCalled();
      expect(tx.payment.updateMany).not.toHaveBeenCalled();
    });

    it('checkout da mesma reserva ainda em criação: in_progress', async () => {
      tx.$queryRaw.mockResolvedValueOnce([ticketRow()]);
      tx.payment.findMany.mockResolvedValue([
        paymentRow({ checkout_url: null }),
      ]);

      await expect(repository.openCheckout(input)).resolves.toEqual({
        outcome: 'in_progress',
      });
      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it.each([
      ['ticket inexistente', [], 'ticket_not_found'],
      ['dono errado', [ticketRow({ user_id: 'other' })], 'wrong_owner'],
      ['já pago', [ticketRow({ is_paid: true })], 'already_paid'],
      [
        'reserva expirada',
        [ticketRow({ reserved_at: new Date(NOW.getTime() - 10 * 60_000) })],
        'expired',
      ],
      ['evento sem preço', [ticketRow({ price_cents: null })], 'not_on_sale'],
    ])('%s: bloqueia sem escrever nada', async (_caso, rows, reason) => {
      tx.$queryRaw.mockResolvedValueOnce(rows);

      await expect(repository.openCheckout(input)).resolves.toEqual({
        outcome: 'blocked',
        reason,
      });
      expect(tx.payment.create).not.toHaveBeenCalled();
      expect(tx.payment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('attachCheckout / markCheckoutFailed', () => {
    it('grava order e URL só se o pagamento ainda está pendente', async () => {
      await expect(
        repository.attachCheckout(PAYMENT_ID, 'ORD1', 'https://x'),
      ).resolves.toMatchObject({
        id: PAYMENT_ID,
      });
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID, status: 'pending' },
        data: { provider_order_id: 'ORD1', checkout_url: 'https://x' },
      });

      prisma.payment.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.attachCheckout(PAYMENT_ID, 'ORD1', 'https://x'),
      ).resolves.toBeNull();
    });

    it('falha ao criar no provedor: o pendente sem URL vira cancelled', async () => {
      await repository.markCheckoutFailed(PAYMENT_ID);
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID, status: 'pending', checkout_url: null },
        data: { status: 'cancelled' },
      });
    });
  });

  describe('settleApproved', () => {
    const arrangeLocks = (
      ticket: Record<string, unknown>,
      payment: Payment,
    ) => {
      tx.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 7,
            user_id: 'user-1',
            reserved_at: RESERVED_AT,
            is_paid: false,
            now: NOW,
            ...ticket,
          },
        ])
        .mockResolvedValueOnce([payment]);
    };

    it('trava o ticket ANTES do pagamento (mesma ordem do checkout: sem deadlock)', async () => {
      arrangeLocks({}, paymentRow());
      tx.$executeRaw.mockResolvedValue(1);

      await repository.settleApproved(PAYMENT_ID, IDS, CHARGED);

      const [ticketLock, paymentLock] = tx.$queryRaw.mock.calls as RawCall[];
      expect(sqlOf(ticketLock)).toMatch(
        /FROM ticket WHERE id = \? FOR UPDATE$/,
      );
      expect(valuesOf(ticketLock)).toEqual([7]);
      expect(sqlOf(paymentLock)).toMatch(
        /FROM payment WHERE id = \? FOR UPDATE$/,
      );
      expect(valuesOf(paymentLock)).toEqual([PAYMENT_ID]);
    });

    it('confirma: ticket pago e pagamento aprovado na mesma transação', async () => {
      arrangeLocks({}, paymentRow());
      tx.$executeRaw.mockResolvedValue(1);

      await expect(
        repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
      ).resolves.toMatchObject({
        outcome: 'confirmed',
        payment: { status: 'approved' },
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [update] = tx.$executeRaw.mock.calls as RawCall[];
      // update condicional: só paga ticket ainda não pago e do mesmo dono
      expect(sqlOf(update)).toMatch(
        /UPDATE ticket SET is_paid = true, updated_at = NOW\(\) WHERE id = \? AND is_paid = false AND user_id = \?/,
      );
      expect(valuesOf(update)).toEqual([7, 'user-1']);
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: PAYMENT_ID },
        data: {
          status: 'approved',
          provider_order_id: 'ORD1',
          provider_payment_id: 'PAY1',
        },
      });
    });

    it('enfileira o email do ingresso na mesma transação da aprovação', async () => {
      arrangeLocks({}, paymentRow());
      tx.$executeRaw.mockResolvedValue(1);

      await repository.settleApproved(PAYMENT_ID, IDS, CHARGED);

      expect(tx.ticket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
      expect(tx.email_outbox.createMany).toHaveBeenCalledWith({
        data: [
          {
            kind: 'ticket_confirmed',
            dedupe_key: `ticket-confirmed:${PAYMENT_ID}`,
            to_email: 'comprador@example.com',
            payload: {
              userName: 'Maria Souza',
              eventId: 10,
              eventName: 'Show',
              eventStartsAt: '2026-06-20T23:00:00.000Z',
              eventLocation: 'Arena',
              ticketId: 7,
              amountCents: 5000,
              currency: 'BRL',
            },
          },
        ],
        skipDuplicates: true,
      });
    });

    it('falha ao enfileirar o email desfaz a aprovação (mesma transação)', async () => {
      arrangeLocks({}, paymentRow());
      tx.$executeRaw.mockResolvedValue(1);
      tx.email_outbox.createMany.mockRejectedValue(new Error('banco caiu'));

      await expect(
        repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
      ).rejects.toThrow('banco caiu');
    });

    it('se o UPDATE condicional não pegar o ticket, aborta a transação (nada é aprovado)', async () => {
      arrangeLocks({}, paymentRow());
      tx.$executeRaw.mockResolvedValue(0);

      await expect(
        repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
      ).rejects.toThrow(/mudou durante a confirmação/);
      expect(tx.payment.update).not.toHaveBeenCalled();
      expect(tx.email_outbox.createMany).not.toHaveBeenCalled();
    });

    it.each([
      ['approved', 'already_approved'],
      ['refunded', 'already_refunded'],
    ] as const)(
      'pagamento já %s: idempotente, não escreve',
      async (status, outcome) => {
        arrangeLocks({}, paymentRow({ status }));

        await expect(
          repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
        ).resolves.toEqual({ outcome });
        expect(tx.$executeRaw).not.toHaveBeenCalled();
        expect(tx.payment.update).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        'reserva vencida (relógio do banco)',
        { now: new Date(DEADLINE.getTime() + 1) },
        'expired',
      ],
      ['ticket vendido a outra pessoa', { user_id: 'other' }, 'wrong_owner'],
      ['ticket já pago por outro pagamento', { is_paid: true }, 'already_paid'],
    ])('%s: pede estorno sem marcar nada', async (_caso, ticket, reason) => {
      arrangeLocks(ticket, paymentRow());

      await expect(
        repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
      ).resolves.toEqual({
        outcome: 'refund_required',
        reason,
      });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('pagamento inexistente: not_found sem travar nada', async () => {
      tx.payment.findUnique.mockResolvedValue(null);
      await expect(
        repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
      ).resolves.toEqual({ outcome: 'not_found' });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('propaga erro do banco (ex.: violação do índice único de aprovado)', async () => {
      arrangeLocks({}, paymentRow());
      tx.$executeRaw.mockResolvedValue(1);
      const unique = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      tx.payment.update.mockRejectedValue(unique);

      await expect(
        repository.settleApproved(PAYMENT_ID, IDS, CHARGED),
      ).rejects.toBe(unique);
    });
  });

  describe('transições condicionais', () => {
    it('markRefunded só sai de estados sem cobrança entregue', async () => {
      await expect(repository.markRefunded(PAYMENT_ID, IDS)).resolves.toBe(
        true,
      );
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          id: PAYMENT_ID,
          status: { in: ['pending', 'rejected', 'cancelled', 'expired'] },
        },
        data: {
          status: 'refunded',
          provider_order_id: 'ORD1',
          provider_payment_id: 'PAY1',
        },
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.markRefunded(PAYMENT_ID, IDS)).resolves.toBe(
        false,
      );
    });

    it('markNotApproved nunca sobrescreve approved/refunded e não apaga o id do pagamento com null', async () => {
      await repository.markNotApproved(PAYMENT_ID, 'rejected', {
        providerOrderId: 'ORD1',
        providerPaymentId: null,
      });
      expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
        where: { id: PAYMENT_ID, status: { in: ['pending'] } },
        data: { status: 'rejected', provider_order_id: 'ORD1' },
      });

      await repository.markNotApproved(PAYMENT_ID, 'cancelled', IDS);
      expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
        where: { id: PAYMENT_ID, status: { in: ['pending', 'rejected'] } },
        data: {
          status: 'cancelled',
          provider_order_id: 'ORD1',
          provider_payment_id: 'PAY1',
        },
      });
    });
  });

  it('findById devolve null quando não existe', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    await expect(repository.findById(PAYMENT_ID)).resolves.toBeNull();
  });
});
