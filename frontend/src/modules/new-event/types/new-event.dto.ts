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
  /** Preço único do ingresso em centavos (100..10.000.000). */
  price_cents: number;
  /** Ingressos ativos (pagos ou reservados) por CPF neste evento: 1..10, até a capacidade. */
  max_tickets_per_cpf: number;
}

/** Resposta de POST /events */
export type CreateEventResponse = EventResponse;
