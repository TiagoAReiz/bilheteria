import type { EventResponse } from "@/shared/types/event";

/** Resposta de GET /events/:id */
export type EventDetailResponse = EventResponse;

/** Resposta de GET /status/:eventId */
export interface TicketStatusResponse {
  total: number;
  available: number;
  reserved: number;
}

/** Body de POST /reservation */
export interface ReserveTicketRequest {
  event_id: number;
}

/** Resposta de POST /reservation */
export interface TicketResponse {
  id: number;
  user_id: string | null;
  event_id: number;
  reserved_at: string | null;
  is_paid: boolean;
}

/** A reserva expira se não for paga nesse prazo (regra do backend). */
export const RESERVATION_TTL_MINUTES = 5;
