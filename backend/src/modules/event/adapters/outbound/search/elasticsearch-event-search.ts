import {Inject, Injectable, Logger} from "@nestjs/common";
import type {Client, estypes} from "@elastic/elasticsearch";
import {ELASTICSEARCH_CLIENT} from "../../../../search/elasticsearch.client.js";
import {SEARCH_INDEX} from "../../../../search/search-indices.js";
import {withSearchAvailability} from "../../../../search/search-availability.js";
import {EventSearchPort} from "../../../application/ports/outbound/search/event-search.port.js";
import {
    EVENT_SEARCH_LIMITS,
    EventSearchCriteria,
    EventSearchHit,
    EventSearchResult,
    EventSuggestion,
    FacetBucket,
} from "../../../core/entities/event-search.entity.js";

// formato do documento no indice `events`: montado pela transform do Sequin
// (infra/search/sequin/transforms/event-document.exs) e descrito pelo index template
// (infra/search/elasticsearch/index-templates/events.json)
export interface EventDocument {
    id: number;
    name: string;
    name_stemmed: string;
    description: string | null;
    location: string;
    starts_at: string;
    capacity: number;
    available_tickets: number;
    // so a chave: a URL publica depende de STORAGE_PUBLIC_URL (a API monta)
    // (ausente nos documentos indexados antes da capa existir)
    cover_key?: string | null;
    organizer_id: string;
    deleted: boolean;
}

type LocationAggregations = {locations: estypes.AggregationsStringTermsAggregate};

const SEARCH_FIELDS = ['name^3', 'name_stemmed^3', 'location^2', 'description'];
const SUGGEST_FIELDS = ['name', 'name._2gram', 'name._3gram'];
const LOCATION_KEYWORD = 'location.keyword';

@Injectable()
export class ElasticsearchEventSearch implements EventSearchPort {
    private readonly logger = new Logger(ElasticsearchEventSearch.name);

    constructor(@Inject(ELASTICSEARCH_CLIENT) private readonly client: Client) {
    }

    async search(criteria: EventSearchCriteria, now: Date): Promise<EventSearchResult<EventSearchHit>> {
        const response = await withSearchAvailability(this.logger, () =>
            this.client.search<EventDocument, LocationAggregations>({
                index: SEARCH_INDEX.events,
                from: (criteria.page - 1) * criteria.size,
                size: criteria.size,
                track_total_hits: true,
                query: {
                    bool: {
                        must: criteria.text ? [textQuery(criteria.text)] : [{match_all: {}}],
                        filter: searchFilters(criteria, now),
                    },
                },
                // o local entra como post_filter: a faceta de locais conta os eventos dos outros filtros,
                // assim o usuario ve as outras cidades disponiveis mesmo com uma ja selecionada
                ...(criteria.location ? {post_filter: {term: {[LOCATION_KEYWORD]: criteria.location}}} : {}),
                aggs: {locations: {terms: {field: LOCATION_KEYWORD, size: EVENT_SEARCH_LIMITS.locationFacets}}},
                sort: criteria.text ? ['_score', {starts_at: 'asc'}] : [{starts_at: 'asc'}],
            }),
        );

        return {
            items: response.hits.hits.flatMap((hit) => (hit._source ? [toSearchItem(hit._source)] : [])),
            total: totalHits(response.hits.total),
            page: criteria.page,
            size: criteria.size,
            facets: {locations: toBuckets(response.aggregations?.locations)},
        };
    }

    async suggest(prefix: string, limit: number, now: Date): Promise<EventSuggestion[]> {
        const response = await withSearchAvailability(this.logger, () =>
            this.client.search<Pick<EventDocument, 'id' | 'name' | 'location' | 'starts_at'>>({
                index: SEARCH_INDEX.events,
                size: limit,
                _source: ['id', 'name', 'location', 'starts_at'],
                query: {
                    bool: {
                        // bool_prefix nos subcampos do search_as_you_type: o ultimo termo vale como prefixo
                        must: [{multi_match: {query: prefix, type: 'bool_prefix', fields: SUGGEST_FIELDS}}],
                        filter: visibleEventFilters(now),
                    },
                },
            }),
        );

        return response.hits.hits.flatMap((hit) => {
            const source = hit._source;
            return source
                ? [{id: source.id, name: source.name, location: source.location, starts_at: new Date(source.starts_at)}]
                : [];
        });
    }
}

function textQuery(text: string): estypes.QueryDslQueryContainer {
    return {
        multi_match: {
            query: text,
            fields: SEARCH_FIELDS,
            // tolera erro de digitacao ("teator" -> "teatro"); termos curtos continuam exatos
            fuzziness: 'AUTO',
            prefix_length: 1,
        },
    };
}

// mesma regra do GET /events: so eventos futuros e nao excluidos
function visibleEventFilters(now: Date): estypes.QueryDslQueryContainer[] {
    return [
        {term: {deleted: false}},
        {range: {starts_at: {gt: now.toISOString()}}},
    ];
}

function searchFilters(criteria: EventSearchCriteria, now: Date): estypes.QueryDslQueryContainer[] {
    const filters = visibleEventFilters(now);
    if (criteria.from || criteria.to) {
        filters.push({
            range: {
                starts_at: {
                    ...(criteria.from ? {gte: criteria.from.toISOString()} : {}),
                    ...(criteria.to ? {lte: criteria.to.toISOString()} : {}),
                },
            },
        });
    }
    if (criteria.onlyAvailable) {
        filters.push({range: {available_tickets: {gt: 0}}});
    }
    return filters;
}

function toSearchItem(source: EventDocument): EventSearchHit {
    return {
        id: source.id,
        name: source.name,
        description: source.description ?? null,
        location: source.location,
        starts_at: new Date(source.starts_at),
        capacity: source.capacity,
        available_tickets: source.available_tickets,
        // documentos indexados antes da capa existir nao tem o campo
        cover_key: source.cover_key ?? null,
    };
}

function totalHits(total: estypes.SearchTotalHits | number | undefined): number {
    if (typeof total === 'number') {
        return total;
    }
    return total?.value ?? 0;
}

function toBuckets(aggregate: estypes.AggregationsStringTermsAggregate | undefined): FacetBucket[] {
    const buckets = aggregate?.buckets;
    if (!Array.isArray(buckets)) {
        return [];
    }
    return buckets.map((bucket) => ({value: String(bucket.key), count: bucket.doc_count}));
}
