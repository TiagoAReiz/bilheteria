"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { eventSearchService } from "../services/event-search.service";
import { SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_CHARS, type EventSuggestion } from "../types/event-search.dto";

interface SuggestionsState {
  query: string;
  items: EventSuggestion[];
}

/**
 * Autocomplete: espera a digitação parar, ignora prefixos curtos e cancela a requisição anterior
 * quando o texto muda (resposta atrasada de "ro" não sobrescreve a de "rock").
 * Falha (ex.: busca fora do ar) não mostra erro: o autocomplete só some.
 */
export function useEventSuggestions(query: string) {
  const debounced = useDebouncedValue(query.trim(), SUGGEST_DEBOUNCE_MS);
  const enabled = debounced.length >= SUGGEST_MIN_CHARS;
  const [state, setState] = useState<SuggestionsState>({ query: "", items: [] });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    eventSearchService.suggest(debounced, controller.signal).then(
      (items) => setState({ query: debounced, items }),
      () => {
        if (!controller.signal.aborted) setState({ query: debounced, items: [] });
      },
    );
    return () => controller.abort();
  }, [debounced, enabled]);

  const settled = enabled && state.query === debounced;
  return {
    suggestions: settled ? state.items : [],
    loading: enabled && !settled,
  };
}
