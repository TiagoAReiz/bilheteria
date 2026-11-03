import {Inject, Injectable} from '@nestjs/common';
import {Event} from "../../core/entities/event.entity.js";
import {NewEvent} from "../../core/entities/new-event.entity.js";
import {EventDetailView, EventView, toEventView, toPhotoViews} from "../../core/entities/event-image.entity.js";
import {EventServicePort} from "../ports/inbound/services/event.service.port.js";
import {EVENT_REPOSITORY, type EventRepositoryPort} from "../ports/outbound/repositories/event.repository.port.js";
import {EVENT_METRICS, type EventMetricsPort} from "../ports/outbound/metrics/event-metrics.port.js";
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from "../../../storage/application/ports/inbound/services/image-storage.service.port.js";

@Injectable()
export class EventService implements EventServicePort {
  constructor(
      @Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepositoryPort,
      @Inject(EVENT_METRICS) private readonly metrics: EventMetricsPort,
      @Inject(IMAGE_STORAGE_SERVICE) private readonly images: ImageStorageServicePort,
  ) {}

  async createEvent(event: NewEvent): Promise<EventView> {
    const created = await this.eventRepository.createWithTickets(event);
    this.metrics.eventCreated();
    return this.toView(created);
  }

  async listUpcomingEvents(): Promise<EventView[]> {
    return (await this.eventRepository.getUpcomingEvents()).map((event) => this.toView(event));
  }

  async getEventById(id: number): Promise<Event> {
    return this.eventRepository.getEventById(id);
  }

  async getEventDetail(id: number): Promise<EventDetailView> {
    const {photos, ...event} = await this.eventRepository.getEventWithPhotos(id);
    return {...this.toView(event), photos: toPhotoViews(photos, (key) => this.images.publicUrl(key))};
  }

  async getEventIdsByOrganizer(organizerId: string): Promise<number[]> {
    return this.eventRepository.getEventIdsByOrganizer(organizerId);
  }

  private toView(event: Event): EventView {
    return toEventView(event, (key) => this.images.publicUrl(key));
  }
}
