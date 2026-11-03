"use client";

import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/shared/lib/api-error";
import { eventSearchService } from "../services/event-search.service";
import {
  hasActiveFilters,
  toSearchParams,
  type EventSearchFilters,
  type LocationFacet,
  type SearchEventsResponse,
} from "../types/event-search.dto";

interface SearchRequest {
  filters: EventSearchFilters;
  page: number;
}

interface SearchOutcome {
  request: SearchRequest;
  data: SearchEventsResponse | null;
  error: string | null;
}

/**
 * Estado da busca da home. `active` é falso enquanto não há filtro aplicado: nesse caso a home
 * mostra a lista padrão (GET /events, que lê do Postgres) e nada depende do Elasticsearch.
 */
export function useEventSearch() {
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [locations, setLocations] = useState<LocationFacet[]>([]);

  // opções do filtro de local: a faceta da busca sem filtros (todos os locais com eventos futuros)
  useEffect(() => {
    const controller = new AbortController();
    eventSearchService.search({ page: 1, size: 1 }, controller.signal).then(
      (data) => setLocations(data.facets.locations),
      // busca fora do ar: o filtro de local fica sem opções e o resto da home segue normal
      () => undefined,
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    eventSearchService.search(toSearchParams(request.filters, request.page), controller.signal).then(
      (data) => setOutcome({ request, data, error: null }),
      (err: unknown) => {
        if (!controller.signal.aborted) setOutcome({ request, data: null, error: getErrorMessage(err) });
      },
    );
    return () => controller.abort();
  }, [request]);

  // só vale o resultado da requisição atual (descarta respostas de buscas anteriores)
  const current = request !== null && outcome?.request === request ? outcome : null;

  const search = useCallback((filters: EventSearchFilters) => {
    setRequest(hasActiveFilters(filters) ? { filters, page: 1 } : null);
  }, []);
  const goToPage = useCallback((page: number) => {
    setRequest((previous) => (previous ? { ...previous, page } : previous));
  }, []);
  // objeto novo com os mesmos filtros: dispara a requisição de novo
  const retry = useCallback(() => {
    setRequest((previous) => (previous ? { ...previous } : previous));
  }, []);
  const clear = useCallback(() => setRequest(null), []);

  return {
    active: request !== null,
    page: request?.page ?? 1,
    result: current?.data ?? null,
    error: current?.error ?? null,
    loading: request !== null && current === null,
    locations,
    search,
    goToPage,
    retry,
    clear,
  };
}
