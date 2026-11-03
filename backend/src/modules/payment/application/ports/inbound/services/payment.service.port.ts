import {CheckoutSession, PaymentView} from "../../../../core/entities/payment.entity.js";

export const PAYMENT_SERVICE = Symbol('PAYMENT_SERVICE');

export interface Payer {
    id: string;
    email: string;
}

/** Resultado do processamento de uma notificação do provedor (log, span e testes). */
export type NotificationOutcome =
    | 'confirmed'      // ticket marcado como pago
    | 'refunded'       // aprovado, mas não deu para entregar o ingresso: estornado
    | 'not_approved'   // recusado/cancelado/expirado no provedor
    | 'pending'        // ainda sem decisão no provedor
    | 'duplicate'      // nada mudou (notificação repetida ou estado já aplicado)
    | 'ignored';       // pedido desconhecido ou que não é nosso

export interface PaymentServicePort {
    /** Abre (ou reaproveita) o checkout do ticket reservado pelo usuário. */
    createCheckout(payer: Payer, ticketId: number): Promise<CheckoutSession>;
    /** Pagamento do próprio usuário (404 para os demais, sem revelar que existe). */
    getPayment(userId: string, paymentId: string): Promise<PaymentView>;
    /**
     * Processa uma notificação JÁ AUTENTICADA do provedor. Nunca confia no corpo: consulta o
     * estado real pelo id. Idempotente. Falha temporária do provedor sobe como 503.
     */
    handleProviderNotification(providerOrderId: string): Promise<NotificationOutcome>;
}
