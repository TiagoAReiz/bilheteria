import { Module } from '@nestjs/common';
import {EventController} from "./adapters/inbound/controllers/event.controller.js";
import {EventSearchController} from "./adapters/inbound/controllers/event-search.controller.js";
import {AvailableTicketsScheduler} from "./adapters/inbound/schedulers/available-tickets.scheduler.js";
import {EventService} from "./application/services/event.service.js";
import {EventSearchService} from "./application/services/event-search.service.js";
import {EventAvailabilityService} from "./application/services/event-availability.service.js";
import {EventRepository} from "./adapters/outbound/repositories/event.repository.js";
import {ElasticsearchEventSearch} from "./adapters/outbound/search/elasticsearch-event-search.js";
import {PrismaModule} from "../prisma/prisma.module.js";
import {SearchModule} from "../search/search.module.js";
import {EVENT_SERVICE} from "./application/ports/inbound/services/event.service.port.js";
import {EVENT_SEARCH_SERVICE} from "./application/ports/inbound/services/event-search.service.port.js";
import {EVENT_AVAILABILITY_SERVICE} from "./application/ports/inbound/services/event-availability.service.port.js";
import {EVENT_REPOSITORY} from "./application/ports/outbound/repositories/event.repository.port.js";
import {EVENT_SEARCH} from "./application/ports/outbound/search/event-search.port.js";

@Module({
  // EventSearchController antes do EventController: /events/search e /events/suggest
  // precisam ser registradas antes de /events/:id
  controllers: [EventSearchController, EventController],
  providers: [
    {provide: EVENT_SERVICE, useClass: EventService},
    {provide: EVENT_SEARCH_SERVICE, useClass: EventSearchService},
    {provide: EVENT_AVAILABILITY_SERVICE, useClass: EventAvailabilityService},
    {provide: EVENT_REPOSITORY, useClass: EventRepository},
    {provide: EVENT_SEARCH, useClass: ElasticsearchEventSearch},
    AvailableTicketsScheduler,
  ],
  exports: [EVENT_SERVICE],
  imports: [PrismaModule, SearchModule],
})
export class EventModule {}
