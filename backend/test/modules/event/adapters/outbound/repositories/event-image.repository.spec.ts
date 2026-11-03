import type { Mock } from 'vitest';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { EventImageRepository } from '../../../../../../src/modules/event/adapters/outbound/repositories/event-image.repository.js';

type RawCall = [TemplateStringsArray, ...unknown[]];
const sqlOf = (call: RawCall) => call[0].join('?').replace(/\s+/g, ' ').trim();

const photoRow = (id: number, position: number) => ({
  id,
  event_id: 5,
  key: `events/5/photos/p${id}.png`,
  position,
  created_at: new Date('2026-01-01T00:00:00Z'),
});

describe('EventImageRepository', () => {
  let tx: {
    $queryRaw: Mock;
    $executeRaw: Mock;
    event: { update: Mock };
    event_photo: { findFirst: Mock; findMany: Mock; aggregate: Mock; create: Mock; delete: Mock };
  };
  let prisma: {
    $transaction: Mock;
    event: { findFirst: Mock };
    event_photo: { count: Mock };
  };
  let repository: EventImageRepository;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ cover_key: 'events/5/cover/old.png' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      event: { update: vi.fn() },
      event_photo: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _max: { position: null } }),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };
    prisma = {
      $transaction: vi.fn((work: (t: typeof tx) => unknown) => work(tx)),
      event: { findFirst: vi.fn() },
      event_photo: { count: vi.fn() },
    };
    repository = new EventImageRepository(prisma as unknown as PrismaService);
  });

  const lockSql = () => sqlOf(tx.$queryRaw.mock.calls[0] as RawCall);

  it('getOrganizerId ignora eventos excluídos', async () => {
    prisma.event.findFirst.mockResolvedValue({ organizer_id: 'org-1' });
    await expect(repository.getOrganizerId(5)).resolves.toBe('org-1');
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: 5, deleted_at: null },
      select: { organizer_id: true },
    });
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(repository.getOrganizerId(5)).resolves.toBeNull();
  });

  describe('replaceCover', () => {
    it('trava o evento, grava a chave nova e devolve a anterior', async () => {
      await expect(repository.replaceCover(5, 'events/5/cover/new.png')).resolves.toEqual({
        previousKey: 'events/5/cover/old.png',
      });
      expect(lockSql()).toBe('SELECT cover_key FROM event WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
      expect(tx.event.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { cover_key: 'events/5/cover/new.png' } });
    });

    it('evento inexistente/excluído: null sem gravar', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(repository.replaceCover(5, null)).resolves.toBeNull();
      expect(tx.event.update).not.toHaveBeenCalled();
    });
  });

  describe('addPhoto', () => {
    it('com o evento travado, adiciona no fim (maior posição + 1)', async () => {
      tx.event_photo.aggregate.mockResolvedValue({ _count: { _all: 3 }, _max: { position: 7 } });
      tx.event_photo.findMany.mockResolvedValue([photoRow(1, 0)]);

      await expect(repository.addPhoto(5, 'events/5/photos/new.png', 10)).resolves.toEqual({
        outcome: 'added',
        photos: [photoRow(1, 0)],
      });
      expect(lockSql()).toContain('FOR UPDATE');
      // o lock vem antes da contagem: duas confirmações simultâneas não leem a mesma contagem
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.event_photo.aggregate.mock.invocationCallOrder[0]);
      expect(tx.event_photo.create).toHaveBeenCalledWith({
        data: { event_id: 5, key: 'events/5/photos/new.png', position: 8 },
      });
      expect(tx.event_photo.findMany).toHaveBeenCalledWith({ where: { event_id: 5 }, orderBy: { position: 'asc' } });
    });

    it('primeira foto fica na posição 0', async () => {
      await repository.addPhoto(5, 'k', 10);
      expect(tx.event_photo.create).toHaveBeenCalledWith({ data: { event_id: 5, key: 'k', position: 0 } });
    });

    it('galeria cheia: limit_reached sem inserir', async () => {
      tx.event_photo.aggregate.mockResolvedValue({ _count: { _all: 10 }, _max: { position: 12 } });
      await expect(repository.addPhoto(5, 'k', 10)).resolves.toEqual({ outcome: 'limit_reached' });
      expect(tx.event_photo.create).not.toHaveBeenCalled();
    });

    it('mesma chave confirmada de novo: não duplica (nem conta para o limite)', async () => {
      tx.event_photo.findFirst.mockResolvedValue({ id: 4 });
      tx.event_photo.aggregate.mockResolvedValue({ _count: { _all: 10 }, _max: { position: 9 } });
      await expect(repository.addPhoto(5, 'k', 10)).resolves.toMatchObject({ outcome: 'added' });
      expect(tx.event_photo.create).not.toHaveBeenCalled();
    });

    it('evento inexistente: event_not_found', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(repository.addPhoto(5, 'k', 10)).resolves.toEqual({ outcome: 'event_not_found' });
      expect(tx.event_photo.create).not.toHaveBeenCalled();
    });
  });

  describe('removePhoto', () => {
    it('remove só foto do próprio evento e devolve a linha', async () => {
      tx.event_photo.findFirst.mockResolvedValue(photoRow(3, 1));
      await expect(repository.removePhoto(5, 3)).resolves.toEqual(photoRow(3, 1));
      expect(tx.event_photo.findFirst).toHaveBeenCalledWith({ where: { id: 3, event_id: 5 } });
      expect(tx.event_photo.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });

    it('foto de outro evento: null sem apagar', async () => {
      await expect(repository.removePhoto(5, 3)).resolves.toBeNull();
      expect(tx.event_photo.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorderPhotos', () => {
    it('passa por posições negativas e depois aplica a ordem pedida', async () => {
      tx.event_photo.findMany
        .mockResolvedValueOnce([photoRow(1, 0), photoRow(2, 1), photoRow(3, 2)])
        .mockResolvedValueOnce([photoRow(3, 0), photoRow(1, 1), photoRow(2, 2)]);

      await expect(repository.reorderPhotos(5, [3, 1, 2])).resolves.toEqual({
        outcome: 'reordered',
        photos: [photoRow(3, 0), photoRow(1, 1), photoRow(2, 2)],
      });
      const [first, second] = tx.$executeRaw.mock.calls as RawCall[];
      expect(sqlOf(first)).toBe('UPDATE event_photo SET position = -position - 1 WHERE event_id = ?');
      expect(sqlOf(second)).toContain('unnest(?::int[]) WITH ORDINALITY');
      expect(second.slice(1)).toEqual([[3, 1, 2], 5]);
    });

    it.each([
      ['faltando foto', [1, 2]],
      ['foto de outro evento', [1, 2, 99]],
      ['repetida', [1, 1, 2]],
    ])('lista %s: mismatch sem escrever', async (_case, ids) => {
      tx.event_photo.findMany.mockResolvedValue([photoRow(1, 0), photoRow(2, 1), photoRow(3, 2)]);
      await expect(repository.reorderPhotos(5, ids)).resolves.toEqual({ outcome: 'mismatch' });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
