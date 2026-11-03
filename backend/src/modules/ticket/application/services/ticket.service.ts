import {ConflictException, ForbiddenException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Status} from "../../core/entities/status.entity.js";
import {Ticket} from "../../core/entities/ticket.entity.js";
import {MAX_TICKETS_PER_USER_PER_EVENT, RESERVATION_TTL_MINUTES, ReservationResult} from "../../core/entities/reservation.entity.js";
import {MyTicket} from "../../core/entities/my-ticket.entity.js";
import {TicketServicePort} from "../ports/inbound/services/ticket.service.port.js";
import {TICKET_REPOSITORY, type TicketRepositoryPort} from "../ports/outbound/repositories/ticket.repository.port.js";
import {TICKET_METRICS, type TicketMetricsPort} from "../ports/outbound/metrics/ticket-metrics.port.js";
import {USER_SERVICE, type UserServicePort} from "../../../users/application/ports/inbound/services/user.service.port.js";
import {EVENT_SERVICE, type EventServicePort} from "../../../event/application/ports/inbound/services/event.service.port.js";
import {Event} from "../../../event/core/entities/event.entity.js";
import {TRACING, type TracingPort} from "../../../observability/application/ports/outbound/tracing/tracing.port.js";

// Desfecho de uma tentativa de reserva antes de virar resposta HTTP.
// event_not_found guarda o erro original para ser relançado sem alteração.
type ReservationAttempt =
    | ReservationResult
    | { outcome: 'no_cpf' }
    | { outcome: 'event_started' }
    | { outcome: 'event_not_found'; error: NotFoundException };

@Injectable()
export class TicketService implements TicketServicePort {
  constructor(
      @Inject(TICKET_REPOSITORY) private readonly ticketRepository: TicketRepositoryPort,
      @Inject(USER_SERVICE) private readonly userService: UserServicePort,
      @Inject(EVENT_SERVICE) private readonly eventService: EventServicePort,
      @Inject(TICKET_METRICS) private readonly metrics: TicketMetricsPort,
      @Inject(TRACING) private readonly tracing: TracingPort,
  ) {}

  async reserveTicket(user_id:string, event_id:number):Promise<Ticket> {
    return this.tracing.inSpan('ticket.reserve', {'event.id': event_id}, async (span) => {
      const startedAt = performance.now();
      // erro inesperado (ex.: banco fora) não tem desfecho de negócio: sobe direto e aparece como 5xx
      const attempt = await this.attemptReservation(user_id, event_id);
      span.setAttributes({outcome: attempt.outcome});
      this.metrics.reservationAttempted(attempt.outcome, performance.now() - startedAt);
      return this.ticketOrThrow(attempt, event_id);
    });
  }

  private async attemptReservation(user_id: string, event_id: number): Promise<ReservationAttempt> {
    // cpf unico por usuario: o limite por usuario continua sendo um limite por cpf
    if(!(await this.userService.hasCpf(user_id))){
      return {outcome: 'no_cpf'};
    }
    let event: Event;
    try {
      event = await this.eventService.getEventById(event_id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {outcome: 'event_not_found', error};
      }
      throw error;
    }
    if(event.starts_at.getTime() <= Date.now()){
      return {outcome: 'event_started'};
    }
    return this.ticketRepository.reserveTicketWithinLimit(user_id, event_id, MAX_TICKETS_PER_USER_PER_EVENT);
  }

  private ticketOrThrow(attempt: ReservationAttempt, event_id: number): Ticket {
    switch (attempt.outcome) {
      case 'reserved':
        return attempt.ticket;
      case 'no_cpf':
        throw new ForbiddenException('Cadastre seu CPF antes de reservar ingressos');
      case 'event_not_found':
        throw attempt.error;
      case 'event_started':
        throw new ConflictException(`O evento ${event_id} já começou, as vendas estão encerradas`);
      case 'limit_reached':
        throw new ConflictException('Não foi possível reservar o ingresso, seu cpf atingiu o limite de ingressos para esse evento! ');
      case 'sold_out':
        throw new ConflictException(`Não há ingressos disponíveis para o evento ${event_id}`);
    }
  }

  async statusTicketsByEvent(id: number):Promise<Status> {
    await this.eventService.getEventById(id);
    let total = (await this.ticketRepository.getCountAllTicketsByEvent(id));
    let available = (await this.ticketRepository.getCountAvailablesTicketsByEvent(id));
    let reserved = total - available;
    return {total, available, reserved}
  }

  async listMyTickets(user_id: string): Promise<MyTicket[]> {
    const ttlMs = RESERVATION_TTL_MINUTES * 60 * 1000;
    const rows = await this.ticketRepository.getActiveTicketsByUser(user_id, new Date(Date.now() - ttlMs));
    return rows.map((row) => ({
      id: row.id,
      status: row.is_paid ? 'paid' : 'reserved',
      // reserved_at nunca é nulo numa reserva ativa (o filtro exige reserved_at >= corte)
      reserved_until: row.is_paid || !row.reserved_at ? null : new Date(row.reserved_at.getTime() + ttlMs),
      event: row.event,
    }));
  }
}
