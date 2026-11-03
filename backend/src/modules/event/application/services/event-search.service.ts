import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import {EVENT_SEARCH_LIMITS, EventSearchCriteria, EventSearchResult, EventSuggestion} from "../../core/entities/event-search.entity.js";
import {EventSearchServicePort} from "../ports/inbound/services/event-search.service.port.js";
import {EVENT_SEARCH, type EventSearchPort} from "../ports/outbound/search/event-search.port.js";
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from "../../../storage/application/ports/inbound/services/image-storage.service.port.js";

@Injectable()
export class EventSearchService implements EventSearchServicePort {
  constructor(
      @Inject(EVENT_SEARCH) private readonly eventSearch: EventSearchPort,
      @Inject(IMAGE_STORAGE_SERVICE) private readonly images: ImageStorageServicePort,
  ) {}

  async searchEvents(criteria: EventSearchCriteria): Promise<EventSearchResult> {
    if (criteria.from && criteria.to && criteria.from > criteria.to) {
      throw new BadRequestException('from deve ser anterior ou igual a to');
    }
    const result = await this.eventSearch.search(criteria, new Date());
    return {
      ...result,
      items: result.items.map(({cover_key, ...item}) => ({...item, cover_url: this.images.publicUrlOrNull(cover_key)})),
    };
  }

  async suggestEvents(prefix: string): Promise<EventSuggestion[]> {
    return this.eventSearch.suggest(prefix, EVENT_SEARCH_LIMITS.suggestions, new Date());
  }
}
