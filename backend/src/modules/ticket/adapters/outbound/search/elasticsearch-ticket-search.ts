import {Inject, Injectable, Logger} from "@nestjs/common";
import type {Client, estypes} from "@elastic/elasticsearch";
import {ELASTICSEARCH_CLIENT} from "../../../../search/elasticsearch.client.js";
import {SEARCH_INDEX} from "../../../../search/search-indices.js";
import {withSearchAvailability} from "../../../../search/search-availability.js";
import {TicketSearchPort} from "../../../application/ports/outbound/search/ticket-search.port.js";
import {
    effectiveTicketStatus,
    reservationExpiryCutoff,
    StoredTicketStatus,
    TicketSearchCriteria,
    TicketSearchItem,
    TicketSearchResult,
    TicketSearchStatus,
} from "../../../core/entities/ticket-search.entity.js";

// formato do documento no indice `tickets` (transform infra/search/sequin/transforms/ticket-document.exs).
// So campos operacionais: nada de CPF nem dados pessoais.
export interface TicketDocument {
    id: number;
    event_id: number;
    user_id: string | null;
    status: StoredTicketStatus;
    reserved_at: string | null;
    is_paid: boolean;
    deleted: boolean;
}

@Injectable()
export class ElasticsearchTicketSearch implements TicketSearchPort {
    private readonly logger = new Logger(ElasticsearchTicketSearch.name);

    constructor(@Inject(ELASTICSEARCH_CLIENT) private readonly client: Client) {
    }

    async search(criteria: TicketSearchCriteria, now: Date): Promise<TicketSearchResult> {
        const filters: estypes.QueryDslQueryContainer[] = [{term: {deleted: false}}];
        if (criteria.eventIds) {
            filters.push({terms: {event_id: criteria.eventIds}});
        }
        if (criteria.status) {
            filters.push(...statusFilters(criteria.status, now));
        }

        const response = await withSearchAvailability(this.logger, () =>
            this.client.search<TicketDocument>({
                index: SEARCH_INDEX.tickets,
                from: (criteria.page - 1) * criteria.size,
                size: criteria.size,
                track_total_hits: true,
                query: {bool: {filter: filters}},
                sort: [{event_id: 'asc'}, {id: 'asc'}],
            }),
        );

        const total = response.hits.total;
        return {
            items: response.hits.hits.flatMap((hit) => (hit._source ? [toTicketItem(hit._source, now)] : [])),
            total: typeof total === 'number' ? total : (total?.value ?? 0),
            page: criteria.page,
            size: criteria.size,
        };
    }
}

// "reserved" e "expired" dividem o mesmo status gravado; a diferenca e so a idade da reserva
function statusFilters(status: TicketSearchStatus, now: Date): estypes.QueryDslQueryContainer[] {
    const cutoff = reservationExpiryCutoff(now).toISOString();
    switch (status) {
        case 'available':
        case 'paid':
            return [{term: {status}}];
        case 'reserved':
            return [{term: {status: 'reserved'}}, {range: {reserved_at: {gte: cutoff}}}];
        case 'expired':
            return [{term: {status: 'reserved'}}, {range: {reserved_at: {lt: cutoff}}}];
    }
}

function toTicketItem(source: TicketDocument, now: Date): TicketSearchItem {
    const reservedAt = source.reserved_at ? new Date(source.reserved_at) : null;
    return {
        id: source.id,
        event_id: source.event_id,
        user_id: source.user_id,
        status: effectiveTicketStatus(source.status, reservedAt, now),
        reserved_at: reservedAt,
        is_paid: source.is_paid,
    };
}
