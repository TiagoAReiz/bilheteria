import {ConflictException, ForbiddenException, Inject, Injectable} from '@nestjs/common';
import {Status} from "../../core/entities/status.entity.js";
import {Ticket} from "../../core/entities/ticket.entity.js";
import {MAX_TICKETS_PER_USER_PER_EVENT, RESERVATION_TTL_MINUTES} from "../../core/entities/reservation.entity.js";
import {TicketServicePort} from "../ports/inbound/services/ticket.service.port.js";
import {TICKET_REPOSITORY, type TicketRepositoryPort} from "../ports/outbound/repositories/ticket.repository.port.js";
import {USER_SERVICE, type UserServicePort} from "../../../users/application/ports/inbound/services/user.service.port.js";
import {EVENT_SERVICE, type EventServicePort} from "../../../event/application/ports/inbound/services/event.service.port.js";

@Injectable()
export class TicketService implements TicketServicePort {
  constructor(
      @Inject(TICKET_REPOSITORY) private readonly ticketRepository: TicketRepositoryPort,
      @Inject(USER_SERVICE) private readonly userService: UserServicePort,
      @Inject(EVENT_SERVICE) private readonly eventService: EventServicePort,
  ) {}
  async reserveTicket(user_id:string, event_id:number):Promise<Ticket> {
    // cpf unico por usuario: o limite por usuario continua sendo um limite por cpf
    if(!(await this.userService.hasCpf(user_id))){
      throw new ForbiddenException('Cadastre seu CPF antes de reservar ingressos');
    }
    const event = await this.eventService.getEventById(event_id);
    if(event.starts_at.getTime() <= Date.now()){
      throw new ConflictException(`O evento ${event_id} já começou, as vendas estão encerradas`);
    }
    const result = await this.ticketRepository.reserveTicketWithinLimit(user_id, event_id, MAX_TICKETS_PER_USER_PER_EVENT);
    switch (result.outcome) {
      case 'reserved':
        return result.ticket;
      case 'limit_reached':
        throw new ConflictException('Não foi possível reservar o ingresso, seu cpf atingiu o limite de ingressos para esse evento! ');
      case 'sold_out':
        throw new ConflictException(`Não há ingressos disponíveis para o evento ${event_id}`);
    }
  }

  async confirmTicketPayment (id: number, user_id:string):Promise<Ticket> {
    let ticket = await this.ticketRepository.getTicketById(id)
    if(ticket.user_id == user_id ){
      if( ticket.reserved_at && Date.now()-ticket.reserved_at.getTime()<=RESERVATION_TTL_MINUTES * 60 * 1000){
        ticket.is_paid = true;
        return this.ticketRepository.updateTicket(ticket);
      }
      throw new ConflictException('Pagamento não efetivado! O ticket expirou, por favor realize uma nova reserva');
    }
    throw new ConflictException('Pagamento não efetivado! O ticket não pertence ao usuário informado, por favor realize uma reserva em sua conta');
  }
  async statusTicketsByEvent(id: number):Promise<Status> {
    await this.eventService.getEventById(id);
    let total = (await this.ticketRepository.getCountAllTicketsByEvent(id));
    let available = (await this.ticketRepository.getCountAvailablesTicketsByEvent(id));
    let reserved = total - available;
    return {total, available, reserved}
  }
}
