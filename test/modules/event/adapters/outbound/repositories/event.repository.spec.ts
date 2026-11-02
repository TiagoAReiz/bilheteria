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
  };
  let repository: EventRepository;

  beforeEach(() => {
    prisma = {
      event: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
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
          'capacity',
          'description',
          'location',
          'name',
          'organizer_id',
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
});
