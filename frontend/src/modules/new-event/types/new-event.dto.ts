import type { EventResponse } from "@/shared/types/event";

/** Body de POST /events */
export interface CreateEventRequest {
  name: string;
  description?: string;
  location: string;
  /** ISO 8601, precisa ser futura. */
  starts_at: string;
  /** 1..100000 */
  capacity: number;
}

/** Resposta de POST /events */
export type CreateEventResponse = EventResponse;
