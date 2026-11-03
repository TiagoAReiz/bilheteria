"use client";

import { useState } from "react";
import { useEventSearch } from "../hooks/useEventSearch";
import { EMPTY_FILTERS, type EventSearchFilters } from "../types/event-search.dto";
import { EventList } from "./event-list";
import { EventSearchBar } from "./event-search-bar";
import { EventSearchResults } from "./event-search-results";

/**
 * Home: barra de busca + lista. Sem filtro aplicado continua a lista de sempre (GET /events, do
 * Postgres); com filtro, os resultados vêm da busca (GET /events/search, do Elasticsearch).
 */
export function EventsHome() {
  const search = useEventSearch();
  const [filters, setFilters] = useState<EventSearchFilters>(EMPTY_FILTERS);

  // limpar volta para a lista padrão e esvazia o formulário (vale para os dois botões)
  function clear() {
    setFilters(EMPTY_FILTERS);
    search.clear();
  }

  return (
    <div className="space-y-8">
      <EventSearchBar
        filters={filters}
        onFiltersChange={setFilters}
        locations={search.locations}
        active={search.active}
        searching={search.loading}
        onSearch={search.search}
        onClear={clear}
      />
      {search.active ? (
        <EventSearchResults
          result={search.result}
          loading={search.loading}
          error={search.error}
          page={search.page}
          onPageChange={search.goToPage}
          onRetry={search.retry}
          onClear={clear}
        />
      ) : (
        <EventList />
      )}
    </div>
  );
}
