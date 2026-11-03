import { Module } from '@nestjs/common';
import { TicketService } from './application/services/ticket.service.js';
import { TicketSearchService } from './application/services/ticket-search.service.js';
import { TicketController } from './adapters/inbound/controllers/ticket.controller.js';
import { TicketSearchController } from './adapters/inbound/controllers/ticket-search.controller.js';
import {TicketRepository} from "./adapters/outbound/repositories/ticket.repository.js";
import {OtelTicketMetrics} from "./adapters/outbound/metrics/otel-ticket-metrics.js";
import {ElasticsearchTicketSearch} from "./adapters/outbound/search/elasticsearch-ticket-search.js";
import {PrismaModule} from "../prisma/prisma.module.js";
import {SearchModule} from "../search/search.module.js";
import {UsersModule} from "../users/users.module.js";
import {EventModule} from "../event/event.module.js";
import {ObservabilityModule} from "../observability/observability.module.js";
import {TICKET_SERVICE} from "./application/ports/inbound/services/ticket.service.port.js";
import {TICKET_SEARCH_SERVICE} from "./application/ports/inbound/services/ticket-search.service.port.js";
import {TICKET_REPOSITORY} from "./application/ports/outbound/repositories/ticket.repository.port.js";
import {TICKET_SEARCH} from "./application/ports/outbound/search/ticket-search.port.js";
import {TICKET_METRICS} from "./application/ports/outbound/metrics/ticket-metrics.port.js";

@Module({
  controllers: [TicketController, TicketSearchController],
  providers: [
    {provide: TICKET_SERVICE, useClass: TicketService},
    {provide: TICKET_SEARCH_SERVICE, useClass: TicketSearchService},
    {provide: TICKET_REPOSITORY, useClass: TicketRepository},
    {provide: TICKET_SEARCH, useClass: ElasticsearchTicketSearch},
    {provide: TICKET_METRICS, useClass: OtelTicketMetrics},
  ],
  imports: [PrismaModule, SearchModule, UsersModule, EventModule, ObservabilityModule],
})
export class TicketModule {}
