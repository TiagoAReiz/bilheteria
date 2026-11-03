import {ForbiddenException, Inject, Injectable} from '@nestjs/common';
import {Role} from "../../../users/core/entities/role.js";
import {TicketSearchResult} from "../../core/entities/ticket-search.entity.js";
import {
  TicketSearchFilters,
  TicketSearchRequester,
  TicketSearchServicePort,
} from "../ports/inbound/services/ticket-search.service.port.js";
import {TICKET_SEARCH, type TicketSearchPort} from "../ports/outbound/search/ticket-search.port.js";
import {EVENT_SERVICE, type EventServicePort} from "../../../event/application/ports/inbound/services/event.service.port.js";

@Injectable()
export class TicketSearchService implements TicketSearchServicePort {
  constructor(
      @Inject(TICKET_SEARCH) private readonly ticketSearch: TicketSearchPort,
      @Inject(EVENT_SERVICE) private readonly eventService: EventServicePort,
  ) {}

  async searchTickets(requester: TicketSearchRequester, filters: TicketSearchFilters): Promise<TicketSearchResult> {
    const eventIds = await this.visibleEventIds(requester, filters.eventId);
    if (eventIds?.length === 0) {
      // organizador sem eventos: nada a mostrar, nem precisa consultar o indice
      return {items: [], total: 0, page: filters.page, size: filters.size};
    }
    return this.ticketSearch.search(
        {eventIds, status: filters.status, page: filters.page, size: filters.size},
        new Date(),
    );
  }

  // ADMIN ve tudo. Qualquer outro papel so ve os ingressos dos proprios eventos, e a posse vem do
  // Postgres (fonte da verdade), nao do indice, que pode estar atrasado.
  private async visibleEventIds(requester: TicketSearchRequester, eventId?: number): Promise<number[] | undefined> {
    if (requester.role === Role.ADMIN) {
      return eventId === undefined ? undefined : [eventId];
    }
    const ownEventIds = await this.eventService.getEventIdsByOrganizer(requester.id);
    if (eventId === undefined) {
      return ownEventIds;
    }
    if (!ownEventIds.includes(eventId)) {
      throw new ForbiddenException(`O evento ${eventId} não pertence a este organizador`);
    }
    return [eventId];
  }
}
