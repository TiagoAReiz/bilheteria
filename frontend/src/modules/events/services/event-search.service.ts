import { api } from "@/shared/services/api";
import type {
  EventSuggestion,
  SearchEventsParams,
  SearchEventsResponse,
} from "../types/event-search.dto";

export const eventSearchService = {
  async search(
    params: SearchEventsParams,
    signal?: AbortSignal,
  ): Promise<SearchEventsResponse> {
    const { data } = await api.get<SearchEventsResponse>("/events/search", {
      params,
      signal,
    });
    return data;
  },

  async suggest(q: string, signal?: AbortSignal): Promise<EventSuggestion[]> {
    const { data } = await api.get<EventSuggestion[]>("/events/suggest", {
      params: { q },
      signal,
    });
    return data;
  },
};
