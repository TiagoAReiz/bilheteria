/** Limites do GET /events/search (validados também no backend). */
export const SEARCH_PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 100;
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEBOUNCE_MS = 250;

/** Query string de GET /events/search. Campos ausentes = filtro desligado. */
export interface SearchEventsParams {
  q?: string;
  location?: string;
  from?: string;
  to?: string;
  available?: boolean;
  page?: number;
  size?: number;
}

/** Item da busca: vem do índice (eventualmente consistente com o banco). */
export interface EventSearchItem {
  id: number;
  name: string;
  description: string | null;
  location: string;
  starts_at: string;
  capacity: number;
  /** Aproximado (atualizado em lote a cada ~10s); o número exato está na página do evento. */
  available_tickets: number;
  /** URL pública da capa (null: sem capa). */
  cover_url: string | null;
}

export interface LocationFacet {
  value: string;
  count: number;
}

export interface SearchEventsResponse {
  items: EventSearchItem[];
  total: number;
  page: number;
  size: number;
  facets: { locations: LocationFacet[] };
}

/** Resposta de GET /events/suggest (até 8 itens). */
export interface EventSuggestion {
  id: number;
  name: string;
  location: string;
  starts_at: string;
}

/** Estado do formulário de busca (o que o usuário digitou/escolheu). */
export interface EventSearchFilters {
  q: string;
  location: string;
  /** "YYYY-MM-DD" do <input type="date">, ou vazio. */
  from: string;
  to: string;
  onlyAvailable: boolean;
}

export const EMPTY_FILTERS: EventSearchFilters = {
  q: "",
  location: "",
  from: "",
  to: "",
  onlyAvailable: false,
};

/** Há algum filtro preenchido? Sem nenhum, a home mostra a lista padrão (GET /events). */
export function hasActiveFilters(filters: EventSearchFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.location !== "" ||
    filters.from !== "" ||
    filters.to !== "" ||
    filters.onlyAvailable
  );
}

/**
 * Converte o formulário na query da API. As datas do <input type="date"> são dias no fuso do
 * navegador: "de" vale desde 00:00 e "até" vale até 23:59:59.999 daquele dia.
 */
export function toSearchParams(
  filters: EventSearchFilters,
  page = 1,
): SearchEventsParams {
  const params: SearchEventsParams = { page, size: SEARCH_PAGE_SIZE };
  const q = filters.q.trim();
  if (q) params.q = q;
  if (filters.location) params.location = filters.location;
  if (filters.from)
    params.from = new Date(`${filters.from}T00:00:00`).toISOString();
  if (filters.to)
    params.to = new Date(`${filters.to}T23:59:59.999`).toISOString();
  if (filters.onlyAvailable) params.available = true;
  return params;
}
