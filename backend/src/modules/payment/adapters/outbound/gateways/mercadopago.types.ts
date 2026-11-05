// Recorte da API de Orders do Mercado Pago (Checkout Pro) usado pelo adapter. Referência:
// https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro/create-order/post
// Valores monetários são strings decimais ("50.00").

export interface MercadoPagoCreateOrderRequest {
  type: 'online';
  processing_mode: 'manual';
  total_amount: string;
  external_reference: string;
  /** Duração ISO 8601 (ex.: PT4M30S) a partir da criação. */
  expiration_time: string;
  description: string;
  payer?: { email: string };
  items: Array<{
    title: string;
    unit_price: string;
    quantity: number;
    external_code: string;
  }>;
  config: {
    online: {
      success_url: string;
      failure_url: string;
      pending_url: string;
      auto_return: 'approved' | 'all';
    };
    payment_method: {
      not_allowed_types: string[];
    };
  };
}

/** Status de uma order (enum da referência de "Get order by ID"). */
export type MercadoPagoOrderStatus =
  | 'created'
  | 'processed'
  | 'action_required'
  | 'processing'
  | 'failed'
  | 'refunded'
  | 'canceled'
  | 'expired'
  | 'charged_back';

export interface MercadoPagoOrder {
  id: string;
  /** Um dos MercadoPagoOrderStatus; string porque o provedor pode criar status novos. */
  status: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  total_paid_amount?: string;
  currency?: string;
  checkout_url?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      status?: string;
      status_detail?: string;
      amount?: string;
    }>;
  };
}

/** Corpo de erro da API de Orders. */
export interface MercadoPagoErrorBody {
  errors?: Array<{ code?: string; message?: string }>;
  error?: string;
  message?: string;
}
