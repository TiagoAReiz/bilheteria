import { api } from "@/shared/services/api";
import type { CheckoutRequest, CheckoutResponse, PaymentResponse } from "../types/payment.dto";

const CHECKOUT_HOSTS = ["mercadopago.com.br", "mercadopago.com"];
const PAYMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só redireciona para HTTPS de um domínio do Mercado Pago (defesa contra open redirect). */
export function isTrustedCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      CHECKOUT_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

export function isPaymentId(value: string | null | undefined): value is string {
  return !!value && PAYMENT_ID.test(value);
}

export const paymentService = {
  async createCheckout(ticketId: number): Promise<CheckoutResponse> {
    const body: CheckoutRequest = { ticket_id: ticketId };
    const { data } = await api.post<CheckoutResponse>("/payments/checkout", body);
    if (!isTrustedCheckoutUrl(data.checkout_url)) {
      throw new Error("Endereço de pagamento inválido. Tente novamente.");
    }
    return data;
  },

  async getPayment(id: string): Promise<PaymentResponse> {
    const { data } = await api.get<PaymentResponse>(`/payments/${encodeURIComponent(id)}`);
    return data;
  },
};
