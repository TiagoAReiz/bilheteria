// aliases mantidos pelo container search-init (infra/search/elasticsearch); o Sequin escreve e a API le
// por eles, entao uma reindexacao troca o indice fisico (events_v1 -> events_v2) sem mudar codigo
export const SEARCH_INDEX = {
  events: 'events',
  tickets: 'tickets',
} as const;
