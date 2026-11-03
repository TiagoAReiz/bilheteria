import {Ticket} from "../../../../core/entities/ticket.entity.js";
import {ReservationResult} from "../../../../core/entities/reservation.entity.js";
import {UserTicketRow} from "../../../../core/entities/my-ticket.entity.js";

export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');

export interface TicketRepositoryPort {
    reserveTicketWithinLimit(user_id: string, event_id: number, limit: number): Promise<ReservationResult>;
    getTicketsByUserAndEvent(user_id: string, event_id: number): Promise<Ticket[]>;
    getCountAvailablesTicketsByEvent(id: number): Promise<number>;
    getCountAllTicketsByEvent(id: number): Promise<number>;
    /** Pagos ou com reserva reservada depois de `reservedSince`, de eventos não removidos. */
    getActiveTicketsByUser(user_id: string, reservedSince: Date): Promise<UserTicketRow[]>;
}
