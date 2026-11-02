import {Ticket} from "./ticket.entity.js";

export const MAX_TICKETS_PER_USER_PER_EVENT = 2;
export const RESERVATION_TTL_MINUTES = 5;

export type ReservationResult =
    | { outcome: 'reserved'; ticket: Ticket }
    | { outcome: 'limit_reached' }
    | { outcome: 'sold_out' };
