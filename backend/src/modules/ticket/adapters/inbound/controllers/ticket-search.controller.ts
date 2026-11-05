import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  TICKET_SEARCH_SERVICE,
  type TicketSearchServicePort,
} from '../../../application/ports/inbound/services/ticket-search.service.port.js';
import { SearchTicketsDto } from '../../dto/search-tickets-dto.js';
import { Role } from '../../../../users/core/entities/role.js';

@Controller('tickets')
export class TicketSearchController {
  constructor(
    @Inject(TICKET_SEARCH_SERVICE)
    private readonly ticketSearchService: TicketSearchServicePort,
  ) {}

  @Roles([Role.ADMIN, Role.ORGANIZER])
  @Get('search')
  search(@Session() session: UserSession, @Query() query: SearchTicketsDto) {
    return this.ticketSearchService.searchTickets(
      // o guard ja garantiu ADMIN ou ORGANIZER; qualquer coisa que nao seja ADMIN cai no escopo restrito
      {
        id: session.user.id,
        role: session.user.role === Role.ADMIN ? Role.ADMIN : Role.ORGANIZER,
      },
      {
        eventId: query.event_id,
        status: query.status,
        page: query.page,
        size: query.size,
      },
    );
  }
}
