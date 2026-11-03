import type { Mock } from 'vitest';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { TicketRepository } from '../../../../../../src/modules/ticket/adapters/outbound/repositories/ticket.repository.js';
import { RESERVATION_TTL_MINUTES } from '../../../../../../src/modules/ticket/core/entities/reservation.entity.js';
import type { Ticket } from '../../../../../../src/modules/ticket/core/entities/ticket.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const ticket: Ticket = {
  id: 42,
  user_id: 'user-1',
  reserved_at: NOW,
  is_paid: false,
  event_id: 10,
};

// $queryRaw e uma tagged template: recebe (strings, ...valores)
type RawCall = [TemplateStringsArray, ...unknown[]];
const sqlOf = (call: RawCall) => call[0].join('?').replace(/\s+/g, ' ');
const valuesOf = (call: RawCall) => call.slice(1);

describe('TicketRepository', () => {
  let tx: { $queryRaw: Mock };
  let prisma: {
    $transaction: Mock;
    ticket: {
      findMany: Mock;
      count: Mock;
    };
  };
  let repository: TicketRepository;

  beforeEach(() => {
    tx = { $queryRaw: vi.fn() };
    prisma = {
      $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) =>
        callback(tx),
      ),
      ticket: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    repository = new TicketRepository(prisma as unknown as PrismaService);
  });

  describe('reserveTicketWithinLimit', () => {
    it('roda tudo dentro de uma transação interativa', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([ticket]);

      await repository.reserveTicketWithinLimit('user-1', 10, 2);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toBeTypeOf('function');
    });

    it('trava a linha do usuário antes de contar e só depois reserva', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([ticket]);

      await repository.reserveTicketWithinLimit('user-1', 10, 2);

      const calls = tx.$queryRaw.mock.calls as RawCall[];
      expect(calls).toHaveLength(3);

      const [lock, count, reserve] = calls;
      expect(sqlOf(lock)).toMatch(
        /SELECT id FROM users WHERE id = \? FOR UPDATE/,
      );
      expect(valuesOf(lock)).toEqual(['user-1']);

      expect(sqlOf(count)).toMatch(/COUNT\(\*\)/);
      expect(sqlOf(count)).toMatch(/FROM ticket/);
      expect(valuesOf(count)).toEqual(['user-1', 10, RESERVATION_TTL_MINUTES]);

      expect(sqlOf(reserve)).toMatch(/UPDATE ticket/);
      expect(sqlOf(reserve)).toMatch(/FOR UPDATE SKIP LOCKED/);
      expect(sqlOf(reserve)).toMatch(/RETURNING \*/);
      expect(valuesOf(reserve)).toEqual([
        'user-1',
        10,
        RESERVATION_TTL_MINUTES,
      ]);
    });

    it('retorna reserved com o ticket quando o UPDATE devolve uma linha', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([ticket]);

      await expect(
        repository.reserveTicketWithinLimit('user-1', 10, 2),
      ).resolves.toEqual({ outcome: 'reserved', ticket });
    });

    it('retorna limit_reached quando count == limit, sem tentar reservar', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 2 }]);

      await expect(
        repository.reserveTicketWithinLimit('user-1', 10, 2),
      ).resolves.toEqual({ outcome: 'limit_reached' });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('retorna limit_reached quando count > limit', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 5 }]);

      await expect(
        repository.reserveTicketWithinLimit('user-1', 10, 2),
      ).resolves.toEqual({ outcome: 'limit_reached' });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('reserva quando count == limit - 1', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([ticket]);

      await expect(
        repository.reserveTicketWithinLimit('user-1', 10, 2),
      ).resolves.toMatchObject({ outcome: 'reserved' });
    });

    it('retorna sold_out quando o UPDATE não retorna linha', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      await expect(
        repository.reserveTicketWithinLimit('user-1', 10, 2),
      ).resolves.toEqual({ outcome: 'sold_out' });
    });

    it('propaga erro da transação', async () => {
      const error = new Error('deadlock');
      tx.$queryRaw.mockRejectedValueOnce(error);

      await expect(
        repository.reserveTicketWithinLimit('user-1', 10, 2),
      ).rejects.toBe(error);
    });
  });

  describe('getTicketsByUserAndEvent', () => {
    it('filtra por usuário e evento', async () => {
      prisma.ticket.findMany.mockResolvedValue([ticket]);

      await expect(
        repository.getTicketsByUserAndEvent('user-1', 10),
      ).resolves.toEqual([ticket]);
      expect(prisma.ticket.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', event_id: 10 },
      });
    });
  });

  describe('getCountAvailablesTicketsByEvent', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('conta não pagos sem reserva ou com reserva expirada (TTL)', async () => {
      prisma.ticket.count.mockResolvedValue(7);

      await expect(
        repository.getCountAvailablesTicketsByEvent(10),
      ).resolves.toBe(7);
      expect(prisma.ticket.count).toHaveBeenCalledWith({
        where: {
          event_id: 10,
          is_paid: false,
          OR: [
            { reserved_at: null },
            {
              reserved_at: {
                lt: new Date(
                  NOW.getTime() - RESERVATION_TTL_MINUTES * 60 * 1000,
                ),
              },
            },
          ],
        },
      });
    });
  });

  describe('getCountAllTicketsByEvent', () => {
    it('conta todos os tickets do evento', async () => {
      prisma.ticket.count.mockResolvedValue(100);

      await expect(repository.getCountAllTicketsByEvent(10)).resolves.toBe(100);
      expect(prisma.ticket.count).toHaveBeenCalledWith({
        where: { event_id: 10 },
      });
    });
  });
});
