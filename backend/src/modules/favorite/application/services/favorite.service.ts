import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventView,
  toEventView,
} from '../../../event/core/entities/event-image.entity.js';
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from '../../../storage/application/ports/inbound/services/image-storage.service.port.js';
import { FavoriteServicePort } from '../ports/inbound/services/favorite.service.port.js';
import {
  FAVORITE_REPOSITORY,
  type FavoriteRepositoryPort,
} from '../ports/outbound/repositories/favorite.repository.port.js';

@Injectable()
export class FavoriteService implements FavoriteServicePort {
  constructor(
    @Inject(FAVORITE_REPOSITORY)
    private readonly repository: FavoriteRepositoryPort,
    @Inject(IMAGE_STORAGE_SERVICE)
    private readonly images: ImageStorageServicePort,
  ) {}

  async favorite(userId: string, eventId: number): Promise<void> {
    const result = await this.repository.add(userId, eventId, new Date());
    if (result === 'event_not_found') {
      throw new NotFoundException(`O evento ${eventId} não foi encontrado`);
    }
  }

  async unfavorite(userId: string, eventId: number): Promise<void> {
    await this.repository.remove(userId, eventId);
  }

  async listFavorites(userId: string): Promise<EventView[]> {
    const events = await this.repository.listEvents(userId, new Date());
    return events.map((event) =>
      toEventView(event, (key) => this.images.publicUrl(key)),
    );
  }
}
