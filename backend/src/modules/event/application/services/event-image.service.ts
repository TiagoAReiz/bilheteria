import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventPhotoView,
  ImageEditor,
  MAX_EVENT_PHOTOS,
  canEditEventImages,
  toPhotoViews,
} from '../../core/entities/event-image.entity.js';
import { EventImageServicePort } from '../ports/inbound/services/event-image.service.port.js';
import {
  EVENT_IMAGE_REPOSITORY,
  type EventImageRepositoryPort,
} from '../ports/outbound/repositories/event-image.repository.port.js';
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from '../../../storage/application/ports/inbound/services/image-storage.service.port.js';
import {
  PresignedUpload,
  imagePrefixes,
} from '../../../storage/core/entities/image.js';

const GALLERY_FULL = `A galeria aceita no máximo ${MAX_EVENT_PHOTOS} fotos. Remova uma para adicionar outra`;

@Injectable()
export class EventImageService implements EventImageServicePort {
  constructor(
    @Inject(EVENT_IMAGE_REPOSITORY)
    private readonly repository: EventImageRepositoryPort,
    @Inject(IMAGE_STORAGE_SERVICE)
    private readonly images: ImageStorageServicePort,
  ) {}

  async createCoverUpload(
    eventId: number,
    editor: ImageEditor,
    contentType: string,
  ): Promise<PresignedUpload> {
    await this.assertCanEdit(eventId, editor);
    return this.images.createUpload(
      'event_cover',
      imagePrefixes.eventCover(eventId),
      contentType,
    );
  }

  async confirmCover(
    eventId: number,
    editor: ImageEditor,
    key: string,
  ): Promise<{ cover_url: string }> {
    await this.assertCanEdit(eventId, editor);
    await this.images.confirmUpload(
      'event_cover',
      imagePrefixes.eventCover(eventId),
      key,
    );
    const replaced = await this.repository.replaceCover(eventId, key);
    if (!replaced) {
      // excluído entre a checagem e a gravação: a imagem nova não é referenciada por ninguém
      await this.images.deleteQuietly('event_cover', key);
      throw this.notFound(eventId);
    }
    if (replaced.previousKey !== key) {
      await this.images.deleteQuietly('event_cover', replaced.previousKey);
    }
    return { cover_url: this.images.publicUrl(key) };
  }

  async removeCover(eventId: number, editor: ImageEditor): Promise<void> {
    await this.assertCanEdit(eventId, editor);
    const replaced = await this.repository.replaceCover(eventId, null);
    if (!replaced) {
      throw this.notFound(eventId);
    }
    await this.images.deleteQuietly('event_cover', replaced.previousKey);
  }

  async createPhotoUpload(
    eventId: number,
    editor: ImageEditor,
    contentType: string,
  ): Promise<PresignedUpload> {
    await this.assertCanEdit(eventId, editor);
    // evita o envio inútil; quem garante o limite é a confirmação (com o evento travado)
    if ((await this.repository.countPhotos(eventId)) >= MAX_EVENT_PHOTOS) {
      throw new ConflictException(GALLERY_FULL);
    }
    return this.images.createUpload(
      'event_photo',
      imagePrefixes.eventPhotos(eventId),
      contentType,
    );
  }

  async confirmPhoto(
    eventId: number,
    editor: ImageEditor,
    key: string,
  ): Promise<{ photos: EventPhotoView[] }> {
    await this.assertCanEdit(eventId, editor);
    await this.images.confirmUpload(
      'event_photo',
      imagePrefixes.eventPhotos(eventId),
      key,
    );
    const result = await this.repository.addPhoto(
      eventId,
      key,
      MAX_EVENT_PHOTOS,
    );
    switch (result.outcome) {
      case 'added':
        return {
          photos: toPhotoViews(result.photos, (k) => this.images.publicUrl(k)),
        };
      case 'limit_reached':
        await this.images.deleteQuietly('event_photo', key);
        throw new ConflictException(GALLERY_FULL);
      case 'event_not_found':
        await this.images.deleteQuietly('event_photo', key);
        throw this.notFound(eventId);
    }
  }

  async removePhoto(
    eventId: number,
    editor: ImageEditor,
    photoId: number,
  ): Promise<void> {
    await this.assertCanEdit(eventId, editor);
    const removed = await this.repository.removePhoto(eventId, photoId);
    if (!removed) {
      throw new NotFoundException(
        `A foto ${photoId} não foi encontrada neste evento`,
      );
    }
    await this.images.deleteQuietly('event_photo', removed.key);
  }

  async reorderPhotos(
    eventId: number,
    editor: ImageEditor,
    photoIds: number[],
  ): Promise<{ photos: EventPhotoView[] }> {
    await this.assertCanEdit(eventId, editor);
    const result = await this.repository.reorderPhotos(eventId, photoIds);
    switch (result.outcome) {
      case 'reordered':
        return {
          photos: toPhotoViews(result.photos, (k) => this.images.publicUrl(k)),
        };
      case 'mismatch':
        throw new BadRequestException(
          'photo_ids deve conter exatamente as fotos atuais da galeria, cada uma uma vez',
        );
      case 'event_not_found':
        throw this.notFound(eventId);
    }
  }

  private async assertCanEdit(
    eventId: number,
    editor: ImageEditor,
  ): Promise<void> {
    const organizerId = await this.repository.getOrganizerId(eventId);
    if (organizerId === null) {
      throw this.notFound(eventId);
    }
    if (!canEditEventImages({ organizer_id: organizerId }, editor)) {
      throw new ForbiddenException(
        'Só o organizador do evento pode alterar as imagens dele',
      );
    }
  }

  private notFound(eventId: number): NotFoundException {
    return new NotFoundException(`O evento ${eventId} não foi encontrado`);
  }
}
