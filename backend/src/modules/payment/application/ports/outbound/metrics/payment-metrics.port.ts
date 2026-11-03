import {CheckoutOutcome, NotApprovedStatus, PaymentRejectionReason} from "../../../../core/entities/payment.entity.js";

export const PAYMENT_METRICS = Symbol('PAYMENT_METRICS');

/** Por que uma notificação do provedor foi recusada antes de qualquer processamento. */
export type WebhookRejectionReason =
    | 'missing_secret'        // MP_WEBHOOK_SECRET vazio: fail closed
    | 'missing_signature'
    | 'malformed_signature'
    | 'invalid_signature'
    | 'stale_signature';      // ts fora da tolerância (possível replay)

// Métricas de negócio do pagamento em termos do domínio (ver TicketMetricsPort). Nunca recebem ids.
export interface PaymentMetricsPort {
    checkoutOpened(outcome: CheckoutOutcome): void;
    paymentConfirmed(): void;
    /** Aprovado pelo provedor mas recusado por nós: vira estorno. */
    paymentRejected(reason: PaymentRejectionReason): void;
    paymentRefunded(reason: PaymentRejectionReason): void;
    paymentNotApproved(status: NotApprovedStatus): void;
    webhookRejected(reason: WebhookRejectionReason): void;
}
