import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nestError } from "@test/helpers";
import { hardRedirect } from "@/shared/lib/navigation";
import { PayTicketButton } from "../components/pay-ticket-button";
import { formatCountdown } from "../hooks/useCountdown";
import { paymentService } from "../services/payment.service";

jest.mock("@/shared/lib/navigation", () => ({ hardRedirect: jest.fn() }));
jest.mock("../services/payment.service", () => ({
  paymentService: { createCheckout: jest.fn() },
}));

const createCheckout = jest.mocked(paymentService.createCheckout);
const NOW = new Date("2099-01-01T12:00:00.000Z");
const CHECKOUT_URL =
  "https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1";

function setup(expiresInMs = 4 * 60_000 + 32_000) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(
    <PayTicketButton
      ticketId={42}
      expiresAt={new Date(NOW.getTime() + expiresInMs)}
    />,
  );
  return { user };
}

describe("<PayTicketButton />", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("mostra a contagem regressiva até o fim da reserva e atualiza a cada segundo", () => {
    setup();
    expect(screen.getByTestId("payment-countdown")).toHaveTextContent("04:32");

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByTestId("payment-countdown")).toHaveTextContent("04:30");
  });

  it("Pagar abre o checkout do ticket e redireciona para o Mercado Pago", async () => {
    createCheckout.mockResolvedValue({
      payment_id: "0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f",
      checkout_url: CHECKOUT_URL,
      expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Pagar" }));

    expect(createCheckout).toHaveBeenCalledWith(42);
    expect(hardRedirect).toHaveBeenCalledWith(CHECKOUT_URL);
    // continua "abrindo" até o navegador sair da página (evita clique duplo)
    expect(
      screen.getByRole("button", { name: /abrindo pagamento/i }),
    ).toBeDisabled();
  });

  it("ao expirar, troca o botão por um aviso para reservar de novo", () => {
    setup(3000);
    expect(screen.getByRole("button", { name: "Pagar" })).toBeEnabled();

    act(() => jest.advanceTimersByTime(3000));

    expect(
      screen.queryByRole("button", { name: "Pagar" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sua reserva expirou");
    expect(screen.getByRole("alert")).toHaveTextContent("Reserve de novo");
  });

  it("reserva já vencida não mostra o botão", () => {
    setup(-1000);
    expect(
      screen.queryByRole("button", { name: "Pagar" }),
    ).not.toBeInTheDocument();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("erro do backend (ex.: 409 reserva expirou) aparece e não redireciona", async () => {
    createCheckout.mockRejectedValue(
      nestError(
        409,
        "Sua reserva expirou (ou está expirando). Reserve o ingresso de novo para pagar",
        "Conflict",
      ),
    );
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Pagar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reserve o ingresso de novo",
    );
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pagar" })).toBeEnabled();
  });
});

describe("formatCountdown", () => {
  it.each([
    [272_000, "04:32"],
    [300_000, "05:00"],
    [999, "00:01"],
    [0, "00:00"],
  ])("%d ms = %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});
