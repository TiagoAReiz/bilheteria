import type { Mock } from 'vitest';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { FavoriteRepository } from '../../../../../../src/modules/favorite/adapters/outbound/repositories/favorite.repository.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('FavoriteRepository', () => {
  let prisma: {
    event: { findFirst: Mock; findMany: Mock };
    event_favorite: { createMany: Mock; deleteMany: Mock };
  };
  let repository: FavoriteRepository;

  beforeEach(() => {
    prisma = {
      event: {
        findFirst: vi.fn().mockResolvedValue({ id: 10 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      event_favorite: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repository = new FavoriteRepository(prisma as unknown as PrismaService);
  });

  describe('add', () => {
    it('só favorita evento futuro e não cancelado; repetir não duplica', async () => {
      await expect(repository.add('user-1', 10, NOW)).resolves.toBe('added');

      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: 10, deleted_at: null, starts_at: { gt: NOW } },
        select: { id: true },
      });
      expect(prisma.event_favorite.createMany).toHaveBeenCalledWith({
        data: [{ user_id: 'user-1', event_id: 10 }],
        skipDuplicates: true,
      });
    });

    it('evento inexistente, cancelado ou passado: event_not_found sem gravar', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(repository.add('user-1', 10, NOW)).resolves.toBe(
        'event_not_found',
      );
      expect(prisma.event_favorite.createMany).not.toHaveBeenCalled();
    });
  });

  it('remove é idempotente (deleteMany)', async () => {
    prisma.event_favorite.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.remove('user-1', 10)).resolves.toBeUndefined();
    expect(prisma.event_favorite.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', event_id: 10 },
    });
  });

  it('lista só eventos futuros e não cancelados, pela data do evento', async () => {
    await repository.listEvents('user-1', NOW);

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        deleted_at: null,
        starts_at: { gt: NOW },
        favorites: { some: { user_id: 'user-1' } },
      },
      orderBy: { starts_at: 'asc' },
    });
  });
});
