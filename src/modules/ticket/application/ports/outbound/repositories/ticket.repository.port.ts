import {Ticket} from "../../../../core/entities/ticket.entity.js";
import {ReservationResult} from "../../../../core/entities/reservation.entity.js";

export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');

export interface TicketRepositoryPort {
    reserveTicketWithinLimit(user_id: string, event_id: number, limit: number): Promise<ReservationResult>;
    getTicketsByUserAndEvent(user_id: string, event_id: number): Promise<Ticket[]>;
    getCountAvailablesTicketsByEvent(id: number): Promise<number>;
    getCountAllTicketsByEvent(id: number): Promise<number>;
    getTicketById(id: number): Promise<Ticket>;
    updateTicket(ticket: Ticket): Promise<Ticket>;
}
