import { Module } from '@nestjs/common';
import {EventController} from "./adapters/inbound/controllers/event.controller.js";
import {EventService} from "./application/services/event.service.js";
import {EventRepository} from "./adapters/outbound/repositories/event.repository.js";
import {OtelEventMetrics} from "./adapters/outbound/metrics/otel-event-metrics.js";
import {PrismaModule} from "../prisma/prisma.module.js";
import {ObservabilityModule} from "../observability/observability.module.js";
import {EVENT_SERVICE} from "./application/ports/inbound/services/event.service.port.js";
import {EVENT_REPOSITORY} from "./application/ports/outbound/repositories/event.repository.port.js";
import {EVENT_METRICS} from "./application/ports/outbound/metrics/event-metrics.port.js";

@Module({
  controllers: [EventController],
  providers: [
    {provide: EVENT_SERVICE, useClass: EventService},
    {provide: EVENT_REPOSITORY, useClass: EventRepository},
    {provide: EVENT_METRICS, useClass: OtelEventMetrics},
  ],
  exports: [EVENT_SERVICE],
  imports: [PrismaModule, ObservabilityModule],
})
export class EventModule {}
