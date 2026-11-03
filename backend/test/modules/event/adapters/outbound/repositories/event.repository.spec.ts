import type { Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { EventRepository } from '../../../../../../src/modules/event/adapters/outbound/repositories/event.repository.js';
import type { NewEvent } from '../../../../../../src/modules/event/core/entities/new-event.entity.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('EventRepository', () => {
  let prisma: {
    event: {
      create: Mock;
      findMany: Mock;
      findFirst: Mock;
    };
    $executeRaw: Mock;
    $transaction: Mock;
  };
  let tx: {
    $queryRaw: Mock;
    event: { findFirst: Mock; update: Mock };
    ticket: { createMany: Mock };
  };
  let repository: EventRepository;

  beforeEach(() => {
    prisma = {
      event: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      $executeRaw: vi.fn(),
      $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx)),
    };
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findFirst: vi.fn(), update: vi.fn() },
      ticket: { createMany: vi.fn() },
    };
    repository = new EventRepository(prisma as unknown as PrismaService);
  });

  describe('createWithTickets', () => {
    const newEvent = {
      name: 'Show',
      description: 'desc',
      location: 'Arena',
      starts_at: new Date('2030-01-01T20:00:00Z'),
      capacity: 3,
      price_cents: 5000,
      max_tickets_per_cpf: 2,
      organizer_id: 'org-1',
    } satisfies NewEvent;

    it('cria o evento com capacity tickets em um único create aninhado', async () => {
      const created = { id: 1, ...newEvent };
      prisma.event.create.mockResolvedValue(created);

      await expect(repository.createWithTickets(newEvent)).resolves.toBe(
        created,
      );
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          name: 'Show',
          description: 'desc',
          location: 'Arena',
          starts_at: newEvent.starts_at,
          capacity: 3,
          price_cents: 5000,
          max_tickets_per_cpf: 2,
          available_tickets: 3,
          organizer_id: 'org-1',
          tickets: {
            createMany: {
              data: [
                { is_paid: false },
                { is_paid: false },
                { is_paid: false },
              ],
            },
          },
        },
      });
    });

    it('gera exatamente capacity tickets para capacidades grandes', async () => {
      prisma.event.create.mockResolvedValue({});
      await repository.createWithTickets({ ...newEvent, capacity: 1000 });

      const data = prisma.event.create.mock.calls[0][0].data;
      expect(data.tickets.createMany.data).toHaveLength(1000);
      expect(
        data.tickets.createMany.data.every(
          (t: object) => JSON.stringify(t) === '{"is_paid":false}',
        ),
      ).toBe(true);
    });

    it('só envia os campos permitidos, ignorando extras no objeto de entrada', async () => {
      prisma.event.create.mockResolvedValue({});
      const withExtras = {
        ...newEvent,
        id: 999,
        deleted_at: new Date(),
        created_at: new Date(),
      } as unknown as NewEvent;

      await repository.createWithTickets(withExtras);

      const data = prisma.event.create.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual(
        [
          'available_tickets',
          'capacity',
          'description',
          'location',
          'max_tickets_per_cpf',
          'name',
          'organizer_id',
          'price_cents',
          'starts_at',
          'tickets',
        ].sort(),
      );
    });
  });

  describe('getUpcomingEvents', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('filtra deletados e eventos que ainda não começaram, ordenando por data', async () => {
      const events = [{ id: 1 }];
      prisma.event.findMany.mockResolvedValue(events);

      await expect(repository.getUpcomingEvents()).resolves.toBe(events);
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { deleted_at: null, starts_at: { gt: NOW } },
        orderBy: { starts_at: 'asc' },
      });
    });
  });

  describe('getEventById', () => {
    it('busca ignorando eventos deletados', async () => {
      const event = { id: 5 };
      prisma.event.findFirst.mockResolvedValue(event);

      await expect(repository.getEventById(5)).resolves.toBe(event);
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: 5, deleted_at: null },
      });
    });

    it('lança NotFound quando não encontra', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      const promise = repository.getEventById(5);
      await expect(promise).rejects.toBeInstanceOf(NotFoundException);
      await expect(promise).rejects.toThrow('O evento 5 não foi encontrado');
    });
  });

  describe('getEventIdsByOrganizer', () => {
    it('busca só os ids dos eventos do organizador, incluindo excluídos', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 3 }, { id: 8 }]);

      await expect(repository.getEventIdsByOrganizer('org-1')).resolves.toEqual(
        [3, 8],
      );
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { organizer_id: 'org-1' },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('refreshAvailableTickets', () => {
    const sqlOf = () => {
      const [strings] = prisma.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      return strings.join('?').replace(/\s+/g, ' ');
    };

    it('faz um único UPDATE em lote e retorna quantos eventos mudaram', async () => {
      prisma.$executeRaw.mockResolvedValue(2);

      await expect(repository.refreshAvailableTickets(5)).resolves.toBe(2);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(sqlOf()).toContain(
        'UPDATE event AS e SET available_tickets = c.available',
      );
    });

    it('só grava eventos cujo contador mudou (não gera CDC à toa)', async () => {
      prisma.$executeRaw.mockResolvedValue(0);
      await repository.refreshAvailableTickets(5);

      expect(sqlOf()).toContain('e.available_tickets <> c.available');
    });

    it('usa o mesmo critério de disponibilidade da reserva, com o TTL parametrizado', async () => {
      prisma.$executeRaw.mockResolvedValue(0);
      await repository.refreshAvailableTickets(7);

      const sql = sqlOf();
      expect(sql).toContain('t.is_paid = false');
      expect(sql).toContain(
        't.reserved_at IS NULL OR t.reserved_at < NOW() - make_interval(mins => ?)',
      );
      // o TTL vai como parametro, nunca interpolado no SQL
      expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual([7]);
    });

    it('ignora eventos passados e excluídos', async () => {
      prisma.$executeRaw.mockResolvedValue(0);
      await repository.refreshAvailableTickets(5);

      expect(sqlOf()).toContain(
        'WHERE ev.deleted_at IS NULL AND ev.starts_at > NOW()',
      );
    });
  });

  describe('updateWithTickets', () => {
    const current = {
      id: 7,
      capacity: 3,
      max_tickets_per_cpf: 2,
      organizer_id: 'org-1',
    };

    it('trava o evento, cria os ingressos novos e soma em available_tickets', async () => {
      tx.event.findFirst.mockResolvedValue(current);
      tx.event.update.mockResolvedValue({ ...current, capacity: 5 });
      const check = vi.fn().mockReturnValue(null);

      await expect(
        repository.updateWithTickets(7, { capacity: 5, name: 'Novo' }, check),
      ).resolves.toEqual({ outcome: 'updated', event: { ...current, capacity: 5 } });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(String(tx.$queryRaw.mock.calls[0][0].join('?'))).toContain('FOR UPDATE');
      expect(check).toHaveBeenCalledWith(current);
      expect(tx.ticket.createMany).toHaveBeenCalledWith({
        data: [
          { event_id: 7, is_paid: false },
          { event_id: 7, is_paid: false },
        ],
      });
      expect(tx.event.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({
          name: 'Novo',
          capacity: 5,
          available_tickets: { increment: 2 },
        }),
      });
    });

    it('sem aumento de capacidade não cria ingressos nem mexe em available_tickets', async () => {
      tx.event.findFirst.mockResolvedValue(current);
      tx.event.update.mockResolvedValue(current);

      await repository.updateWithTickets(7, { max_tickets_per_cpf: 3 }, () => null);

      expect(tx.ticket.createMany).not.toHaveBeenCalled();
      expect(tx.event.update.mock.calls[0][0].data).not.toHaveProperty('available_tickets');
    });

    it('recusa sem gravar nada quando a regra recusa', async () => {
      tx.event.findFirst.mockResolvedValue(current);

      await expect(
        repository.updateWithTickets(7, { capacity: 2 }, () => 'capacity_decrease'),
      ).resolves.toEqual({ outcome: 'rejected', reason: 'capacity_decrease' });
      expect(tx.ticket.createMany).not.toHaveBeenCalled();
      expect(tx.event.update).not.toHaveBeenCalled();
    });

    it('NotFound para evento inexistente ou excluído', async () => {
      tx.event.findFirst.mockResolvedValue(null);
      await expect(repository.updateWithTickets(9, {}, () => null)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
