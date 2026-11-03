import {Body, Controller, Get, Inject, Param, ParseIntPipe, Post} from '@nestjs/common';
import {AllowAnonymous, Roles, Session, type UserSession} from "@thallesp/nestjs-better-auth";
import {EVENT_SERVICE, type EventServicePort} from "../../../application/ports/inbound/services/event.service.port.js";
import {CreateEventDto} from "../../dto/create-event-dto.js";
import {Role} from "../../../../users/core/entities/role.js";

@Controller("events")
export class EventController {
  constructor(@Inject(EVENT_SERVICE) private readonly eventService: EventServicePort) {}

  @Roles([Role.ORGANIZER, Role.ADMIN])
  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateEventDto) {
    return this.eventService.createEvent({
      name: dto.name,
      description: dto.description,
      location: dto.location,
      starts_at: dto.starts_at,
      capacity: dto.capacity,
      price_cents: dto.price_cents,
      organizer_id: session.user.id,
    });
  }

  @AllowAnonymous()
  @Get()
  listUpcoming() {
    return this.eventService.listUpcomingEvents();
  }

  @AllowAnonymous()
  @Get(":id")
  getById(@Param("id", ParseIntPipe) id: number) {
    return this.eventService.getEventById(id);
  }
}
