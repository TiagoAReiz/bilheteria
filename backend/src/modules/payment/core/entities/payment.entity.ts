export const PAYMENT_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Moeda única por enquanto (a conta do Mercado Pago é brasileira; a moeda vem da conta).
export const PAYMENT_CURRENCY = 'BRL';

/**
 * Uma tentativa de pagamento de um ticket num provedor.
 * - `pending`: checkout criado, aguardando o provedor.
 * - `approved`: provedor aprovou E o ticket foi marcado como pago (mesma transação).
 * - `rejected` / `cancelled` / `expired`: não houve cobrança (recusa, cancelamento, prazo).
 * - `refunded`: o provedor aprovou, mas o ingresso não pôde ser entregue; o valor foi estornado.
 */
export interface Payment {
  id: string;
  ticket_id: number;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  checkout_url: string | null;
  // fim da reserva paga por este checkout
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

/** O que o comprador recebe ao abrir um checkout. */
export interface CheckoutSession {
  payment_id: string;
  checkout_url: string;
  expires_at: Date;
}

/** O que o dono vê em GET /payments/:id (sem ids internos do provedor). */
export interface PaymentView {
  id: string;
  ticket_id: number;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  expires_at: Date;
  // só enquanto pendente: permite voltar ao checkout
  checkout_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Por que um pagamento APROVADO pelo provedor não virou ingresso pago (e foi estornado).
 * Os valores viram o label `reason` de bilheteria_payments_rejected_total.
 */
export type PaymentRejectionReason =
  | 'expired' // a reserva paga venceu (ou o ticket foi reservado de novo)
  | 'wrong_owner' // o ticket agora é de outra pessoa
  | 'already_paid' // o ticket já foi pago por outro pagamento
  | 'amount_mismatch'; // valor/moeda cobrados diferentes do esperado

/** Status finais sem cobrança vindos do provedor (label `status` de bilheteria_payments_not_approved_total). */
export type NotApprovedStatus = Extract<
  PaymentStatus,
  'rejected' | 'cancelled' | 'expired'
>;

export type CheckoutOutcome = 'created' | 'reused';

export function toPaymentView(payment: Payment): PaymentView {
  return {
    id: payment.id,
    ticket_id: payment.ticket_id,
    status: payment.status,
    amount_cents: payment.amount_cents,
    currency: payment.currency,
    expires_at: payment.expires_at,
    checkout_url: payment.status === 'pending' ? payment.checkout_url : null,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  };
}
