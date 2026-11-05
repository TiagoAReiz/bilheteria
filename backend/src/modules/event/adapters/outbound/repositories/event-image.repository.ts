import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import {
  EventPhoto,
  isPermutationOf,
} from '../../../core/entities/event-image.entity.js';
import {
  AddPhotoResult,
  EventImageRepositoryPort,
  ReorderPhotosResult,
} from '../../../application/ports/outbound/repositories/event-image.repository.port.js';

type Tx = Prisma.TransactionClient;

/**
 * Toda escrita começa travando a linha do evento (`SELECT ... FOR UPDATE`): confirmações
 * simultâneas da galeria entram em fila, então a contagem e a próxima posição são calculadas
 * sem corrida (o limite de 10 não estoura) e remoção/reordenação não se atropelam.
 * O lock não gera escrita em `event` (nem mensagem de CDC para a busca); trocar a capa gera,
 * e é o que leva a capa nova para o índice.
 */
@Injectable()
export class EventImageRepository implements EventImageRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getOrganizerId(eventId: number): Promise<string | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deleted_at: null },
      select: { organizer_id: true },
    });
    return event?.organizer_id ?? null;
  }

  async countPhotos(eventId: number): Promise<number> {
    return await this.prisma.event_photo.count({
      where: { event_id: eventId },
    });
  }

  async replaceCover(
    eventId: number,
    key: string | null,
  ): Promise<{ previousKey: string | null } | null> {
    return await this.prisma.$transaction(async (tx) => {
      const event = await lockEvent(tx, eventId);
      if (!event) {
        return null;
      }
      await tx.event.update({
        where: { id: eventId },
        data: { cover_key: key },
      });
      return { previousKey: event.cover_key };
    });
  }

  async addPhoto(
    eventId: number,
    key: string,
    maxPhotos: number,
  ): Promise<AddPhotoResult> {
    return await this.prisma.$transaction(async (tx) => {
      if (!(await lockEvent(tx, eventId))) {
        return { outcome: 'event_not_found' };
      }
      // confirmação repetida (clique duplo, retry): devolve a galeria sem duplicar
      const existing = await tx.event_photo.findFirst({
        where: { event_id: eventId, key },
        select: { id: true },
      });
      if (!existing) {
        const stats = await tx.event_photo.aggregate({
          where: { event_id: eventId },
          _count: { _all: true },
          _max: { position: true },
        });
        if (stats._count._all >= maxPhotos) {
          return { outcome: 'limit_reached' };
        }
        await tx.event_photo.create({
          data: {
            event_id: eventId,
            key,
            position: (stats._max.position ?? -1) + 1,
          },
        });
      }
      return { outcome: 'added', photos: await listPhotos(tx, eventId) };
    });
  }

  async removePhoto(
    eventId: number,
    photoId: number,
  ): Promise<EventPhoto | null> {
    return await this.prisma.$transaction(async (tx) => {
      if (!(await lockEvent(tx, eventId))) {
        return null;
      }
      const photo = await tx.event_photo.findFirst({
        where: { id: photoId, event_id: eventId },
      });
      if (!photo) {
        return null;
      }
      await tx.event_photo.delete({ where: { id: photo.id } });
      return photo;
    });
  }

  async reorderPhotos(
    eventId: number,
    photoIds: number[],
  ): Promise<ReorderPhotosResult> {
    return await this.prisma.$transaction(async (tx) => {
      if (!(await lockEvent(tx, eventId))) {
        return { outcome: 'event_not_found' };
      }
      const current = await listPhotos(tx, eventId);
      if (
        !isPermutationOf(
          current.map((photo) => photo.id),
          photoIds,
        )
      ) {
        return { outcome: 'mismatch' };
      }
      // (event_id, position) é único e checado linha a linha: primeiro tudo para posições
      // negativas (livres), depois cada foto para a posição nova (0, 1, 2...)
      await tx.$executeRaw`UPDATE event_photo SET position = -position - 1 WHERE event_id = ${eventId}`;
      await tx.$executeRaw`
                UPDATE event_photo AS p
                SET position = o.ord - 1
                FROM unnest(${photoIds}::int[]) WITH ORDINALITY AS o(id, ord)
                WHERE p.id = o.id AND p.event_id = ${eventId}`;
      return { outcome: 'reordered', photos: await listPhotos(tx, eventId) };
    });
  }
}

async function lockEvent(
  tx: Tx,
  eventId: number,
): Promise<{ cover_key: string | null } | null> {
  const rows = await tx.$queryRaw<{ cover_key: string | null }[]>`
        SELECT cover_key FROM event WHERE id = ${eventId} AND deleted_at IS NULL FOR UPDATE`;
  return rows[0] ?? null;
}

async function listPhotos(tx: Tx, eventId: number): Promise<EventPhoto[]> {
  return await tx.event_photo.findMany({
    where: { event_id: eventId },
    orderBy: { position: 'asc' },
  });
}
