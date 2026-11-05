export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreateCheckoutRequest {
  /** Nosso id do pagamento: vira a referência externa e a chave de idempotência no provedor. */
  paymentId: string;
  ticketId: number;
  title: string;
  amountCents: number;
  currency: string;
  payerEmail?: string;
  /** Depois disso o checkout não aceita mais pagamento (= fim da reserva). */
  expiresAt: Date;
}

export interface CreatedCheckout {
  providerOrderId: string;
  checkoutUrl: string;
}

/** Estado de um pedido no provedor, já traduzido para o nosso vocabulário. */
export type ProviderOrderStatus =
  | 'pending' // criado, aguardando pagamento ou em análise
  | 'approved' // pago
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'charged_back';

export interface ProviderOrder {
  providerOrderId: string;
  externalReference: string | null;
  status: ProviderOrderStatus;
  providerPaymentId: string | null;
  amountCents: number;
  currency: string;
}

/**
 * O que o módulo precisa de um provedor de pagamento. O service não conhece o Mercado Pago:
 * HTTP, formatos, status e credenciais ficam no adapter.
 */
export interface PaymentGatewayPort {
  /** Gravado em payment.provider. */
  readonly provider: string;
  createCheckout(request: CreateCheckoutRequest): Promise<CreatedCheckout>;
  /** null quando o provedor não conhece o pedido. */
  getOrder(providerOrderId: string): Promise<ProviderOrder | null>;
  /** Estorno total. Idempotente: pedido já estornado conta como sucesso. */
  refund(providerOrderId: string): Promise<void>;
}

/** Falha temporária (rede, timeout, 5xx, 429): vale tentar de novo. */
export class PaymentGatewayUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PaymentGatewayUnavailableError';
  }
}

/** O provedor recusou a operação (credencial, dados inválidos...): tentar de novo não resolve. */
export class PaymentGatewayRejectedError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PaymentGatewayRejectedError';
  }
}
