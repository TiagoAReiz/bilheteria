import {Role} from "../../../../../users/core/entities/role.js";
import {TicketSearchResult, TicketSearchStatus} from "../../../../core/entities/ticket-search.entity.js";

export const TICKET_SEARCH_SERVICE = Symbol('TICKET_SEARCH_SERVICE');

export interface TicketSearchRequester {
    id: string;
    role: Role;
}

export interface TicketSearchFilters {
    eventId?: number;
    status?: TicketSearchStatus;
    page: number;
    size: number;
}

export interface TicketSearchServicePort {
    searchTickets(requester: TicketSearchRequester, filters: TicketSearchFilters): Promise<TicketSearchResult>;
}
