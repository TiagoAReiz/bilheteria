import {Inject, Injectable} from '@nestjs/common';
import {EventAvailabilityServicePort} from "../ports/inbound/services/event-availability.service.port.js";
import {EVENT_REPOSITORY, type EventRepositoryPort} from "../ports/outbound/repositories/event.repository.port.js";
// a regra de expiracao da reserva e do dominio de ticket; o contador precisa usar exatamente a mesma
import {RESERVATION_TTL_MINUTES} from "../../../ticket/core/entities/reservation.entity.js";

@Injectable()
export class EventAvailabilityService implements EventAvailabilityServicePort {
  constructor(@Inject(EVENT_REPOSITORY) private readonly eventRepository: EventRepositoryPort) {}

  async refreshAvailableTickets(): Promise<number> {
    return this.eventRepository.refreshAvailableTickets(RESERVATION_TTL_MINUTES);
  }
}
