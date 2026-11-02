import type { EventResponse } from "@/shared/types/event";

/** Resposta de GET /events: próximos eventos (futuros e não excluídos). */
export type ListEventsResponse = EventResponse[];
