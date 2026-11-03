import {EventSearchCriteria, EventSearchResult, EventSuggestion} from "../../../../core/entities/event-search.entity.js";

export const EVENT_SEARCH = Symbol('EVENT_SEARCH');

// leitura no indice de busca (eventualmente consistente com o Postgres, alimentado por CDC).
// `now` vem de fora para a regra "so eventos futuros" ser deterministica e testavel.
export interface EventSearchPort {
    search(criteria: EventSearchCriteria, now: Date): Promise<EventSearchResult>;
    suggest(prefix: string, limit: number, now: Date): Promise<EventSuggestion[]>;
}
