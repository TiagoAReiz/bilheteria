import { Controller, Get, Post, Body, Param, ParseIntPipe, Inject } from '@nestjs/common';
import {TICKET_SERVICE, type TicketServicePort} from "../../../application/ports/inbound/services/ticket.service.port.js";
import { ReservationDto } from '../../dto/reservation-dto.js';
import {WebhookDto} from "../../dto/webhook-payment-dto.js";
import {AllowAnonymous, Session, type UserSession} from "@thallesp/nestjs-better-auth";

@Controller()
export class TicketController {
  constructor(@Inject(TICKET_SERVICE) private readonly ticketService: TicketServicePort) {}

  @AllowAnonymous()
  @Get("/status/:id")
  statusTicketsByEvent(@Param("id", ParseIntPipe) id: number) {
    return this.ticketService.statusTicketsByEvent(id);
  }

  @Post("/reservation")
  reservation(@Session() session: UserSession, @Body() dto :ReservationDto) {
    return this.ticketService.reserveTicket(session.user.id,dto.event_id);
  }

  // chamado pelo gateway de pagamento, que nao tem sessao
  @AllowAnonymous()
  @Post("/webhook/ticket/payment")
  webhookConfirmTicketPayment(@Body() dto:WebhookDto) {
    return this.ticketService.confirmTicketPayment(dto.id, dto.user_id)
  }
}
