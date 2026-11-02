import {Status} from "../../../../core/entities/status.entity.js";
import {Ticket} from "../../../../core/entities/ticket.entity.js";

export const TICKET_SERVICE = Symbol('TICKET_SERVICE');

export interface TicketServicePort {
    reserveTicket(user_id: string, event_id: number): Promise<Ticket>;
    confirmTicketPayment(id: number, user_id: string): Promise<Ticket>;
    statusTicketsByEvent(id: number): Promise<Status>;
}
