import {Inject, Injectable} from '@nestjs/common';
import {Event} from "../../core/entities/event.entity.js";
import {NewEvent} from "../../core/entities/new-event.entity.js";
import {EventServicePort} from "../ports/inbound/services/event.service.port.js";
import {EVENT_REPOSITORY, type EventRepositoryPort} from "../ports/outbound/repositories/event.repository.port.js";
import {EVENT_METRICS, type EventMetricsPort} from "../ports/outbound/metrics/event-metrics.port.js";

@Injectable()
export class EventService implements EventServicePort {
  constructor(
      @Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepositoryPort,
      @Inject(EVENT_METRICS) private readonly metrics: EventMetricsPort,
  ) {}

  async createEvent(event: NewEvent): Promise<Event> {
    const created = await this.eventRepository.createWithTickets(event);
    this.metrics.eventCreated();
    return created;
  }

  async listUpcomingEvents(): Promise<Event[]> {
    return this.eventRepository.getUpcomingEvents();
  }

  async getEventById(id: number): Promise<Event> {
    return this.eventRepository.getEventById(id);
  }
}
