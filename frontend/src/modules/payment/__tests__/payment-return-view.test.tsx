import { act, render, screen } from "@testing-library/react";
import { nestError } from "@test/helpers";
import { PaymentReturnView } from "../components/payment-return-view";
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_MAX_ATTEMPTS } from "../hooks/usePaymentStatus";
import { paymentService } from "../services/payment.service";
import type { PaymentResponse } from "../types/payment.dto";

const PAYMENT_ID = "0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
let search = new URLSearchParams(`payment_id=${PAYMENT_ID}`);

jest.mock("next/navigation", () => ({ useSearchParams: () => search }));
jest.mock("../services/payment.service", () => ({
  ...jest.requireActual("../services/payment.service"),
  paymentService: { getPayment: jest.fn() },
}));

const getPayment = jest.mocked(paymentService.getPayment);
const NOW = new Date("2099-01-01T12:00:00.000Z");

const makePayment = (overrides: Partial<PaymentResponse> = {}): PaymentResponse => ({
  id: PAYMENT_ID,
  ticket_id: 42,
  status: "pending",
  amount_cents: 8990,
  currency: "BRL",
  expires_at: new Date(NOW.getTime() + 3 * 60_000).toISOString(),
  checkout_url: "https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1",
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  ...overrides,
});

/** Deixa as promises do mock resolverem dentro do act. */
const flush = () => act(async () => {});

describe("<PaymentReturnView />", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    search = new URLSearchParams(`payment_id=${PAYMENT_ID}`);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("a URL de sucesso não basta: mostra o status real da API (aqui, ainda pendente)", async () => {
    getPayment.mockResolvedValue(makePayment());
    render(<PaymentReturnView variant="success" />);
    await flush();

    expect(getPayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(screen.getByRole("status")).toHaveTextContent("Aguardando a confirmação do pagamento");
    expect(screen.getByText(/pela página de “pagamento aprovado”/)).toBeInTheDocument();
    expect(screen.getByText(/registrado pela bilheteria/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s89,90/)).toBeInTheDocument();
    expect(screen.getByText("Consultando o status...")).toBeInTheDocument();
  });

  it("enquanto pendente, consulta de novo a cada 3 s até o webhook confirmar", async () => {
    getPayment.mockResolvedValueOnce(makePayment()).mockResolvedValueOnce(makePayment({ status: "approved" }));
    render(<PaymentReturnView variant="pending" />);
    await flush();
    expect(getPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(PAYMENT_POLL_INTERVAL_MS);
    });

    expect(getPayment).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Pagamento confirmado!");
    expect(screen.queryByText("Consultando o status...")).not.toBeInTheDocument();

    // status final: para de consultar
    await act(async () => {
      jest.advanceTimersByTime(PAYMENT_POLL_INTERVAL_MS * 3);
    });
    expect(getPayment).toHaveBeenCalledTimes(2);
  });

  it("a URL de falha não basta: se a API diz aprovado, mostra aprovado", async () => {
    getPayment.mockResolvedValue(makePayment({ status: "approved", checkout_url: null }));
    render(<PaymentReturnView variant="failure" />);
    await flush();

    expect(screen.getByRole("status")).toHaveTextContent("Pagamento confirmado!");
    expect(screen.queryByRole("link", { name: /voltar ao pagamento/i })).not.toBeInTheDocument();
  });

  it.each([
    ["rejected", "Pagamento recusado"],
    ["cancelled", "Pagamento cancelado"],
    ["expired", "Pagamento expirado"],
    ["refunded", "Pagamento estornado"],
  ] as const)("status %s: %s, sem polling", async (status, title) => {
    getPayment.mockResolvedValue(makePayment({ status, checkout_url: null }));
    render(<PaymentReturnView variant="failure" />);
    await flush();

    expect(screen.getByRole("status")).toHaveTextContent(title);
    await act(async () => {
      jest.advanceTimersByTime(PAYMENT_POLL_INTERVAL_MS * 2);
    });
    expect(getPayment).toHaveBeenCalledTimes(1);
  });

  it("estornado explica que o valor foi devolvido", async () => {
    getPayment.mockResolvedValue(makePayment({ status: "refunded", checkout_url: null }));
    render(<PaymentReturnView variant="success" />);
    await flush();
    expect(screen.getByText(/valor foi devolvido/)).toBeInTheDocument();
  });

  it("pendente e dentro do prazo: oferece voltar ao checkout do Mercado Pago", async () => {
    getPayment.mockResolvedValue(makePayment());
    render(<PaymentReturnView variant="pending" />);
    await flush();

    expect(screen.getByRole("link", { name: /voltar ao pagamento/i })).toHaveAttribute(
      "href",
      "https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1",
    );
  });

  it("para de consultar depois do limite e oferece atualizar", async () => {
    getPayment.mockResolvedValue(makePayment({ checkout_url: null }));
    render(<PaymentReturnView variant="pending" />);
    await flush();

    for (let i = 1; i < PAYMENT_POLL_MAX_ATTEMPTS; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(PAYMENT_POLL_INTERVAL_MS);
      });
    }
    expect(getPayment).toHaveBeenCalledTimes(PAYMENT_POLL_MAX_ATTEMPTS);
    expect(screen.getByText(/demorando mais que o normal/)).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: /atualizar/i }).click();
    });
    expect(getPayment).toHaveBeenCalledTimes(PAYMENT_POLL_MAX_ATTEMPTS + 1);
  });

  it("aceita o external_reference que o Mercado Pago devolve na URL", async () => {
    search = new URLSearchParams(`external_reference=${PAYMENT_ID}&status=approved`);
    getPayment.mockResolvedValue(makePayment({ status: "approved" }));
    render(<PaymentReturnView variant="success" />);
    await flush();
    expect(getPayment).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("id ausente ou inválido na URL: não consulta a API", async () => {
    search = new URLSearchParams("payment_id=../../users/me");
    render(<PaymentReturnView variant="success" />);
    await flush();

    expect(screen.getByText("Pagamento não identificado")).toBeInTheDocument();
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("404 (pagamento de outra pessoa ou inexistente)", async () => {
    getPayment.mockRejectedValue(nestError(404, "Pagamento não encontrado", "Not Found"));
    render(<PaymentReturnView variant="success" />);
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Pagamento não encontrado");
  });
});
