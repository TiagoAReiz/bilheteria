import { Controller, Get, Post, Body, Param, ParseIntPipe, Inject } from '@nestjs/common';
import {TICKET_SERVICE, type TicketServicePort} from "../../../application/ports/inbound/services/ticket.service.port.js";
import { ReservationDto } from '../../dto/reservation-dto.js';
import {AllowAnonymous, Session, type UserSession} from "@thallesp/nestjs-better-auth";

// O antigo POST /webhook/ticket/payment (público e sem assinatura) foi removido: o pagamento
// agora é confirmado pelo webhook assinado do Mercado Pago (POST /webhooks/mercadopago).
@Controller()
export class TicketController {
  constructor(@Inject(TICKET_SERVICE) private readonly ticketService: TicketServicePort) {}

  @AllowAnonymous()
  @Get("/status/:id")
  statusTicketsByEvent(@Param("id", ParseIntPipe) id: number) {
    return this.ticketService.statusTicketsByEvent(id);
  }

  // ingressos pagos e reservas ainda válidas do usuário logado ("Minhas reservas")
  @Get("/tickets/me")
  myTickets(@Session() session: UserSession) {
    return this.ticketService.listMyTickets(session.user.id);
  }

  @Post("/reservation")
  reservation(@Session() session: UserSession, @Body() dto :ReservationDto) {
    return this.ticketService.reserveTicket(session.user.id,dto.event_id);
  }
}
