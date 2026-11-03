import { Module } from '@nestjs/common';
import { TicketService } from './application/services/ticket.service.js';
import { TicketController } from './adapters/inbound/controllers/ticket.controller.js';
import {TicketRepository} from "./adapters/outbound/repositories/ticket.repository.js";
import {OtelTicketMetrics} from "./adapters/outbound/metrics/otel-ticket-metrics.js";
import {PrismaModule} from "../prisma/prisma.module.js";
import {UsersModule} from "../users/users.module.js";
import {EventModule} from "../event/event.module.js";
import {ObservabilityModule} from "../observability/observability.module.js";
import {TICKET_SERVICE} from "./application/ports/inbound/services/ticket.service.port.js";
import {TICKET_REPOSITORY} from "./application/ports/outbound/repositories/ticket.repository.port.js";
import {TICKET_METRICS} from "./application/ports/outbound/metrics/ticket-metrics.port.js";

@Module({
  controllers: [TicketController],
  providers: [
    {provide: TICKET_SERVICE, useClass: TicketService},
    {provide: TICKET_REPOSITORY, useClass: TicketRepository},
    {provide: TICKET_METRICS, useClass: OtelTicketMetrics},
  ],
  imports: [PrismaModule, UsersModule, EventModule, ObservabilityModule],
})
export class TicketModule {}
