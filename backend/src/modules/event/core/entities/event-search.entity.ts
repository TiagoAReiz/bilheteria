export const EVENT_SEARCH_LIMITS = {
    maxQueryLength: 100,
    defaultPageSize: 12,
    maxPageSize: 50,
    // (maxPage * maxPageSize) fica dentro do index.max_result_window padrao do Elasticsearch (10.000)
    maxPage: 200,
    suggestions: 8,
    locationFacets: 20,
} as const;

export interface EventSearchCriteria {
    text?: string;
    location?: string;
    from?: Date;
    to?: Date;
    onlyAvailable: boolean;
    page: number;
    size: number;
}

export interface EventSearchItem {
    id: number;
    name: string;
    description: string | null;
    location: string;
    starts_at: Date;
    capacity: number;
    // aproximado (atualizado em lote); o numero exato vem do GET /status/:id
    available_tickets: number;
    // URL publica da capa (montada pela API a partir da chave indexada)
    cover_url: string | null;
}

/** Item como vem do indice: a capa ainda e so a chave do objeto no bucket. */
export type EventSearchHit = Omit<EventSearchItem, 'cover_url'> & {cover_key: string | null};

export interface FacetBucket {
    value: string;
    count: number;
}

export interface EventSearchResult<T = EventSearchItem> {
    items: T[];
    total: number;
    page: number;
    size: number;
    facets: {locations: FacetBucket[]};
}

export interface EventSuggestion {
    id: number;
    name: string;
    location: string;
    starts_at: Date;
}
