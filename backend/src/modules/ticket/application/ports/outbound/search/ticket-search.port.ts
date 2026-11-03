import {TicketSearchCriteria, TicketSearchResult} from "../../../../core/entities/ticket-search.entity.js";

export const TICKET_SEARCH = Symbol('TICKET_SEARCH');

export interface TicketSearchPort {
    search(criteria: TicketSearchCriteria, now: Date): Promise<TicketSearchResult>;
}
