/** Status de um pagamento na API (GET /payments/:id). */
export type PaymentStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded";

/** Body de POST /payments/checkout. O valor não vai do front: é o preço do evento. */
export interface CheckoutRequest {
  ticket_id: number;
}

/** Resposta de POST /payments/checkout. */
export interface CheckoutResponse {
  payment_id: string;
  /** Página de pagamento do Mercado Pago (Pix, cartão). */
  checkout_url: string;
  /** Fim da reserva: depois disso o checkout não aceita pagamento. */
  expires_at: string;
}

/** Resposta de GET /payments/:id. */
export interface PaymentResponse {
  id: string;
  ticket_id: number;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  expires_at: string;
  /** Só enquanto pendente: permite voltar ao checkout. */
  checkout_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Por qual URL de retorno o Mercado Pago trouxe a pessoa de volta. Não é o status real. */
export type PaymentReturnVariant = "success" | "pending" | "failure";
