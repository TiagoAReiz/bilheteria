import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Event } from '../../../../event/core/entities/event.entity.js';
import { FavoriteRepositoryPort } from '../../../application/ports/outbound/repositories/favorite.repository.port.js';

@Injectable()
export class FavoriteRepository implements FavoriteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async add(
    userId: string,
    eventId: number,
    now: Date,
  ): Promise<'added' | 'event_not_found'> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deleted_at: null, starts_at: { gt: now } },
      select: { id: true },
    });
    if (!event) {
      return 'event_not_found';
    }
    // PK (user_id, event_id): favoritar de novo não duplica nem dá erro
    await this.prisma.event_favorite.createMany({
      data: [{ user_id: userId, event_id: eventId }],
      skipDuplicates: true,
    });
    return 'added';
  }

  async remove(userId: string, eventId: number): Promise<void> {
    await this.prisma.event_favorite.deleteMany({
      where: { user_id: userId, event_id: eventId },
    });
  }

  async listEvents(userId: string, now: Date): Promise<Event[]> {
    return await this.prisma.event.findMany({
      where: {
        deleted_at: null,
        starts_at: { gt: now },
        favorites: { some: { user_id: userId } },
      },
      orderBy: { starts_at: 'asc' },
    });
  }
}
