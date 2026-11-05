// Regras do pagamento como funções puras: o repositório as chama DENTRO da transação (com o
// ticket travado e o relógio do Postgres), e os testes as exercitam sem banco.
import { RESERVATION_TTL_MINUTES } from '../../../ticket/core/entities/reservation.entity.js';
import { Payment, PaymentRejectionReason } from './payment.entity.js';

const TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

/** Abaixo disso de reserva restante não vale abrir checkout: o comprador não conseguiria pagar a tempo. */
export const MIN_CHECKOUT_WINDOW_MS = 30_000;

/**
 * Por quanto tempo um checkout pendente ainda sem URL (o pedido ao provedor está em andamento)
 * bloqueia outro checkout do mesmo ticket. Precisa ser maior que o timeout HTTP do gateway.
 */
export const CHECKOUT_CREATION_GRACE_MS = 30_000;

/** Estado do ticket lido com `FOR UPDATE`. */
export interface TicketSnapshot {
  id: number;
  user_id: string | null;
  reserved_at: Date | null;
  is_paid: boolean;
}

/** Ticket + evento, para abrir o checkout. */
export interface CheckoutTicket extends TicketSnapshot {
  event_id: number;
  event_name: string;
  price_cents: number | null;
  event_starts_at: Date;
  event_deleted: boolean;
}

export type CheckoutBlocker =
  | 'ticket_not_found'
  | 'wrong_owner'
  | 'already_paid'
  | 'expired'
  | 'not_on_sale';

/** Fim da reserva (mesma regra do módulo ticket: reserved_at + TTL). */
export function reservationDeadline(reservedAt: Date): Date {
  return new Date(reservedAt.getTime() + TTL_MS);
}

/** Por que o usuário não pode abrir um checkout para este ticket (undefined = pode). */
export function checkoutBlocker(
  ticket: CheckoutTicket,
  userId: string,
  now: Date,
): CheckoutBlocker | undefined {
  // dono primeiro: para quem não é dono, não importa (nem vaza) se o ticket está pago
  if (ticket.user_id !== userId) {
    return 'wrong_owner';
  }
  if (ticket.is_paid) {
    return 'already_paid';
  }
  if (
    ticket.reserved_at === null ||
    reservationDeadline(ticket.reserved_at).getTime() - now.getTime() <
      MIN_CHECKOUT_WINDOW_MS
  ) {
    return 'expired';
  }
  if (
    ticket.price_cents === null ||
    ticket.event_deleted ||
    ticket.event_starts_at.getTime() <= now.getTime()
  ) {
    return 'not_on_sale';
  }
  return undefined;
}

export type PendingCheckoutDecision =
  | { action: 'reuse'; payment: Payment & { checkout_url: string } }
  | { action: 'wait' }
  | { action: 'create' };

/**
 * Checkouts pendentes do ticket: reaproveita o da MESMA reserva (mesmo dono e mesmo fim de
 * reserva) que já tem URL; espera se ele ainda está sendo criado; senão cria outro (e os
 * pendentes antigos expiram).
 */
export function decidePendingCheckout(
  pending: Payment[],
  userId: string,
  deadline: Date,
  now: Date,
): PendingCheckoutDecision {
  const sameReservation = pending.find(
    (p) =>
      p.user_id === userId && p.expires_at.getTime() === deadline.getTime(),
  );
  if (!sameReservation) {
    return { action: 'create' };
  }
  if (sameReservation.checkout_url !== null) {
    return {
      action: 'reuse',
      payment: {
        ...sameReservation,
        checkout_url: sameReservation.checkout_url,
      },
    };
  }
  if (
    now.getTime() - sameReservation.created_at.getTime() <
    CHECKOUT_CREATION_GRACE_MS
  ) {
    return { action: 'wait' };
  }
  // pedido ao provedor que nunca terminou (ex.: processo caiu no meio): descarta e cria outro
  return { action: 'create' };
}

/** O que o provedor diz ter cobrado. */
export interface ChargedAmount {
  amountCents: number;
  currency: string;
}

export type ApprovalDecision =
  { action: 'confirm' } | { action: 'refund'; reason: PaymentRejectionReason };

/**
 * Pagamento aprovado pelo provedor: entrega o ingresso ou estorna.
 * Só confirma se a reserva paga ainda é a mesma (mesmo dono, mesmo fim de reserva), não venceu
 * e o ticket não foi pago por outro pagamento. `now` é o relógio do Postgres.
 */
export function decideApproval(
  ticket: TicketSnapshot,
  payment: Payment,
  charged: ChargedAmount,
  now: Date,
): ApprovalDecision {
  if (
    charged.amountCents !== payment.amount_cents ||
    charged.currency !== payment.currency
  ) {
    return { action: 'refund', reason: 'amount_mismatch' };
  }
  if (ticket.is_paid) {
    return { action: 'refund', reason: 'already_paid' };
  }
  if (ticket.user_id !== payment.user_id) {
    return { action: 'refund', reason: 'wrong_owner' };
  }
  const sameReservation =
    ticket.reserved_at !== null &&
    reservationDeadline(ticket.reserved_at).getTime() ===
      payment.expires_at.getTime();
  if (!sameReservation || now.getTime() > payment.expires_at.getTime()) {
    return { action: 'refund', reason: 'expired' };
  }
  return { action: 'confirm' };
}
