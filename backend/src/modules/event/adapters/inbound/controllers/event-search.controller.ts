import { Controller, Get, Inject, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  EVENT_SEARCH_SERVICE,
  type EventSearchServicePort,
} from '../../../application/ports/inbound/services/event-search.service.port.js';
import {
  SearchEventsDto,
  SuggestEventsDto,
} from '../../dto/search-events-dto.js';

// precisa ser registrado ANTES do EventController (ordem em event.module.ts): senao
// GET /events/search cai em GET /events/:id e o ParseIntPipe responde 400
@Controller('events')
export class EventSearchController {
  constructor(
    @Inject(EVENT_SEARCH_SERVICE)
    private readonly eventSearchService: EventSearchServicePort,
  ) {}

  @AllowAnonymous()
  @Get('search')
  search(@Query() query: SearchEventsDto) {
    return this.eventSearchService.searchEvents({
      text: query.q,
      location: query.location,
      from: query.from,
      to: query.to,
      onlyAvailable: query.available ?? false,
      page: query.page,
      size: query.size,
    });
  }

  @AllowAnonymous()
  @Get('suggest')
  suggest(@Query() query: SuggestEventsDto) {
    return this.eventSearchService.suggestEvents(query.q);
  }
}
