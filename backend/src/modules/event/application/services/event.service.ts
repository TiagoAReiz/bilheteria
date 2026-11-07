import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Event } from '../../core/entities/event.entity.js';
import { NewEvent } from '../../core/entities/new-event.entity.js';
import {
  EventDetailView,
  EventView,
  toEventView,
  toPhotoViews,
} from '../../core/entities/event-image.entity.js';
import {
  checkEventUpdate,
  EventChanges,
  EventEditor,
  EventUpdateRejection,
} from '../../core/entities/event-update.js';
import { EventServicePort } from '../ports/inbound/services/event.service.port.js';
import {
  EVENT_REPOSITORY,
  type EventRepositoryPort,
} from '../ports/outbound/repositories/event.repository.port.js';
import {
  EVENT_METRICS,
  type EventMetricsPort,
} from '../ports/outbound/metrics/event-metrics.port.js';
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from '../../../storage/application/ports/inbound/services/image-storage.service.port.js';

@Injectable()
export class EventService implements EventServicePort {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepositoryPort,
    @Inject(EVENT_METRICS) private readonly metrics: EventMetricsPort,
    @Inject(IMAGE_STORAGE_SERVICE)
    private readonly images: ImageStorageServicePort,
  ) {}

  async createEvent(event: NewEvent): Promise<EventView> {
    const created = await this.eventRepository.createWithTickets(event);
    this.metrics.eventCreated();
    return this.toView(created);
  }

  async listUpcomingEvents(): Promise<EventView[]> {
    return (await this.eventRepository.getUpcomingEvents()).map((event) =>
      this.toView(event),
    );
  }

  async getEventById(id: number): Promise<Event> {
    return this.eventRepository.getEventById(id);
  }

  async getEventDetail(id: number): Promise<EventDetailView> {
    const { photos, ...event } =
      await this.eventRepository.getEventWithPhotos(id);
    return {
      ...this.toView(event),
      photos: toPhotoViews(photos, (key) => this.images.publicUrl(key)),
    };
  }

  async getEventIdsByOrganizer(organizerId: string): Promise<number[]> {
    return this.eventRepository.getEventIdsByOrganizer(organizerId);
  }

  async updateEvent(
    id: number,
    editor: EventEditor,
    changes: EventChanges,
  ): Promise<EventView> {
    const result = await this.eventRepository.updateWithTickets(
      id,
      changes,
      (current) => checkEventUpdate(current, changes, editor, new Date()),
    );
    if (result.outcome === 'rejected') {
      throw this.rejection(result.reason);
    }
    return this.toView(result.event);
  }

  private rejection(reason: EventUpdateRejection): Error {
    switch (reason) {
      case 'forbidden':
        return new ForbiddenException(
          'Só o organizador do evento pode editá-lo',
        );
      case 'event_started':
        return new ConflictException(
          'O evento já começou e não pode mais ser editado',
        );
      case 'capacity_decrease':
        return new ConflictException(
          'A capacidade não pode diminuir, só aumentar',
        );
      case 'limit_decrease':
        return new ConflictException(
          'O limite de ingressos por CPF não pode diminuir, só aumentar',
        );
      case 'limit_above_capacity':
        return new ConflictException(
          'O limite de ingressos por CPF não pode ser maior que a capacidade',
        );
      case 'sales_already_open':
        return new ConflictException(
          'As vendas já abriram; a data de início das vendas não muda mais',
        );
      case 'sales_after_start':
        return new ConflictException(
          'O início das vendas tem que ser antes do início do evento',
        );
    }
  }

  private toView(event: Event): EventView {
    return toEventView(event, (key) => this.images.publicUrl(key));
  }
}
