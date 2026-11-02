/** Evento retornado pela API (GET /events, GET /events/:id, POST /events). */
export interface EventResponse {
  id: number;
  name: string;
  description: string | null;
  location: string;
  starts_at: string;
  capacity: number;
  organizer_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
