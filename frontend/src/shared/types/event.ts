/** Evento retornado pela API (GET /events, GET /events/:id, POST /events). */
export interface EventResponse {
  id: number;
  name: string;
  description: string | null;
  location: string;
  starts_at: string;
  capacity: number;
  /** Preço único do ingresso em centavos (BRL). null: evento antigo, sem venda. */
  price_cents: number | null;
  organizer_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
