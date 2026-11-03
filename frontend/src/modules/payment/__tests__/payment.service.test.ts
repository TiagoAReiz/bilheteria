import { api } from "@/shared/services/api";
import { isPaymentId, isTrustedCheckoutUrl, paymentService } from "../services/payment.service";

jest.mock("@/shared/services/api", () => ({ api: { post: jest.fn(), get: jest.fn() } }));

const PAYMENT_ID = "0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const CHECKOUT_URL = "https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1";

describe("paymentService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("createCheckout envia só o ticket_id (o valor vem do backend)", async () => {
    const checkout = { payment_id: PAYMENT_ID, checkout_url: CHECKOUT_URL, expires_at: "2099-01-01T00:05:00.000Z" };
    jest.mocked(api.post).mockResolvedValue({ data: checkout });

    await expect(paymentService.createCheckout(7)).resolves.toEqual(checkout);
    expect(api.post).toHaveBeenCalledWith("/payments/checkout", { ticket_id: 7 });
  });

  it("createCheckout recusa URL que não é do Mercado Pago (open redirect)", async () => {
    jest.mocked(api.post).mockResolvedValue({
      data: { payment_id: PAYMENT_ID, checkout_url: "https://evil.example.com", expires_at: "x" },
    });
    await expect(paymentService.createCheckout(7)).rejects.toThrow(/inválido/);
  });

  it("getPayment consulta GET /payments/:id", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: { id: PAYMENT_ID } });
    await paymentService.getPayment(PAYMENT_ID);
    expect(api.get).toHaveBeenCalledWith(`/payments/${PAYMENT_ID}`);
  });

  it.each([
    [CHECKOUT_URL, true],
    ["https://mercadopago.com/x", true],
    ["http://www.mercadopago.com.br/x", false],
    ["https://mercadopago.com.br.evil.com/x", false],
    ["javascript:alert(1)", false],
    ["não é url", false],
  ])("isTrustedCheckoutUrl(%p) = %p", (url, trusted) => {
    expect(isTrustedCheckoutUrl(url)).toBe(trusted);
  });

  it.each([
    [PAYMENT_ID, true],
    ["123", false],
    ["../users/me", false],
    [null, false],
  ])("isPaymentId(%p) = %p", (value, valid) => {
    expect(isPaymentId(value)).toBe(valid);
  });
});
