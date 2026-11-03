import {NotApprovedStatus, Payment, PaymentRejectionReason} from "../../../../core/entities/payment.entity.js";
import {ChargedAmount, CheckoutBlocker, CheckoutTicket} from "../../../../core/entities/payment-rules.js";

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface OpenCheckoutInput {
    ticketId: number;
    userId: string;
    provider: string;
    currency: string;
}

export type OpenCheckoutResult =
    | { outcome: 'blocked'; reason: CheckoutBlocker }
    | { outcome: 'in_progress' }
    | { outcome: 'reused'; payment: Payment & { checkout_url: string } }
    | { outcome: 'created'; payment: Payment; ticket: CheckoutTicket };

export interface ProviderIds {
    providerOrderId: string;
    providerPaymentId: string | null;
}

export type SettlementResult =
    | { outcome: 'confirmed'; payment: Payment }
    | { outcome: 'already_approved' }
    | { outcome: 'already_refunded' }
    | { outcome: 'refund_required'; reason: PaymentRejectionReason }
    | { outcome: 'not_found' };

export interface PaymentRepositoryPort {
    /**
     * Numa transação com o ticket travado: valida a reserva, reaproveita o checkout pendente
     * da mesma reserva ou expira os antigos e cria um pagamento `pending`.
     */
    openCheckout(input: OpenCheckoutInput): Promise<OpenCheckoutResult>;
    /** Grava o pedido criado no provedor; null se o pagamento não está mais pendente. */
    attachCheckout(paymentId: string, providerOrderId: string, checkoutUrl: string): Promise<Payment | null>;
    /** O provedor não criou o checkout: o pendente vira `cancelled` (libera um novo checkout). */
    markCheckoutFailed(paymentId: string): Promise<void>;
    findById(paymentId: string): Promise<Payment | null>;
    /**
     * Aprovação do provedor, numa transação com ticket e pagamento travados (nessa ordem):
     * confirma (ticket pago + payment aprovado juntos) ou diz que precisa estornar.
     */
    settleApproved(paymentId: string, ids: ProviderIds, charged: ChargedAmount): Promise<SettlementResult>;
    /** Estorno concluído. false se nada mudou (já estornado ou aprovado). */
    markRefunded(paymentId: string, ids: ProviderIds): Promise<boolean>;
    /** Recusa/cancelamento/expiração no provedor. false se nada mudou. */
    markNotApproved(paymentId: string, status: NotApprovedStatus, ids: ProviderIds): Promise<boolean>;
}
