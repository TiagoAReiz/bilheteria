import type { EventResponse } from "@/shared/types/event";

/** Foto da galeria (ordenada por `position`). */
export interface EventPhoto {
  id: number;
  url: string;
  position: number;
}

/** Resposta de GET /events/:id: evento com a capa e a galeria. */
export type EventDetailResponse = EventResponse & { photos: EventPhoto[] };

/** Resposta de PUT /events/:id/cover */
export interface ConfirmCoverResponse {
  cover_url: string;
}

/** Resposta de POST /events/:id/photos e PATCH /events/:id/photos/order: a galeria inteira. */
export interface GalleryResponse {
  photos: EventPhoto[];
}

/** Body de PATCH /events/:id/photos/order */
export interface ReorderPhotosRequest {
  photo_ids: number[];
}

/** Tamanho máximo da galeria (regra do backend). */
export const MAX_EVENT_PHOTOS = 10;

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
