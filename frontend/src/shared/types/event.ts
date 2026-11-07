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
  /** Quantos ingressos ativos (pagos ou reservados) um mesmo CPF pode ter neste evento. */
  max_tickets_per_cpf: number;
  /** URL pública da capa (null: sem capa). */
  cover_url: string | null;
  /** Início das vendas (ISO). null: vendendo. No futuro: "Em breve", sem compra até lá. */
  sales_starts_at: string | null;
  organizer_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
