import { Module } from '@nestjs/common';
import {EventController} from "./adapters/inbound/controllers/event.controller.js";
import {EventService} from "./application/services/event.service.js";
import {EventRepository} from "./adapters/outbound/repositories/event.repository.js";
import {PrismaModule} from "../prisma/prisma.module.js";
import {EVENT_SERVICE} from "./application/ports/inbound/services/event.service.port.js";
import {EVENT_REPOSITORY} from "./application/ports/outbound/repositories/event.repository.port.js";

@Module({
  controllers: [EventController],
  providers: [{provide: EVENT_SERVICE, useClass: EventService}, {provide: EVENT_REPOSITORY, useClass: EventRepository}],
  exports: [EVENT_SERVICE],
  imports: [PrismaModule],
})
export class EventModule {}
