import {Inject, Injectable} from '@nestjs/common';
import {Event} from "../../core/entities/event.entity.js";
import {NewEvent} from "../../core/entities/new-event.entity.js";
import {EventServicePort} from "../ports/inbound/services/event.service.port.js";
import {EVENT_REPOSITORY, type EventRepositoryPort} from "../ports/outbound/repositories/event.repository.port.js";

@Injectable()
export class EventService implements EventServicePort {
  constructor(@Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepositoryPort) {}

  async createEvent(event: NewEvent): Promise<Event> {
    return this.eventRepository.createWithTickets(event);
  }

  async listUpcomingEvents(): Promise<Event[]> {
    return this.eventRepository.getUpcomingEvents();
  }

  async getEventById(id: number): Promise<Event> {
    return this.eventRepository.getEventById(id);
  }
}
