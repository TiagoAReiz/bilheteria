import {
  EventSearchCriteria,
  EventSearchResult,
  EventSuggestion,
} from '../../../../core/entities/event-search.entity.js';

export const EVENT_SEARCH_SERVICE = Symbol('EVENT_SEARCH_SERVICE');

export interface EventSearchServicePort {
  searchEvents(criteria: EventSearchCriteria): Promise<EventSearchResult>;
  suggestEvents(prefix: string): Promise<EventSuggestion[]>;
}
