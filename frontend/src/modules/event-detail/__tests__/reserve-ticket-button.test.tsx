import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { makeUser, nestError, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { ReserveTicketButton } from "../components/reserve-ticket-button";
import { eventDetailService } from "../services/event-detail.service";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/event-detail.service", () => ({ eventDetailService: { reserveTicket: jest.fn() } }));

const mockedUseSession = jest.mocked(useSession);
const reserveTicket = jest.mocked(eventDetailService.reserveTicket);

function setup(props: Partial<React.ComponentProps<typeof ReserveTicketButton>> = {}) {
  const onReserved = jest.fn();
  render(<ReserveTicketButton eventId={4} onReserved={onReserved} {...props} />);
  return { onReserved, button: screen.getByRole("button", { name: /reservar ingresso/i }) };
}

describe("<ReserveTicketButton />", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue(sessionValue(makeUser()));
  });

  it("sem login, manda para /login com redirect para o evento", async () => {
    mockedUseSession.mockReturnValue(sessionValue(null));
    const { button } = setup();
    await userEvent.click(button);
    expect(push).toHaveBeenCalledWith("/login?redirect=%2Fevents%2F4");
    expect(reserveTicket).not.toHaveBeenCalled();
  });

  it("fica desabilitado enquanto a sessão carrega", () => {
    mockedUseSession.mockReturnValue(sessionValue(null, "loading"));
    expect(setup().button).toBeDisabled();
  });

  it("logado, reserva e mostra o aviso de expiração em 5 minutos", async () => {
    reserveTicket.mockResolvedValue({
      id: 42,
      user_id: "user-1",
      event_id: 4,
      reserved_at: new Date().toISOString(),
      is_paid: false,
    });
    const { button, onReserved } = setup();
    await userEvent.click(button);

    expect(reserveTicket).toHaveBeenCalledWith(4);
    expect(await screen.findByText("Reserva #42 confirmada")).toBeInTheDocument();
    expect(screen.getByText(/expira em 5 minutos/i)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Ingresso reservado!");
    expect(onReserved).toHaveBeenCalled();
  });

  it("depois de reservar, oferece pagar com a contagem até o fim da reserva", async () => {
    reserveTicket.mockResolvedValue({
      id: 42,
      user_id: "user-1",
      event_id: 4,
      reserved_at: new Date().toISOString(),
      is_paid: false,
    });
    const { button } = setup();
    await userEvent.click(button);

    expect(await screen.findByRole("button", { name: "Pagar" })).toBeEnabled();
    expect(screen.getByTestId("payment-countdown")).toHaveTextContent(/^0[45]:\d{2}$/);
  });

  it("403: avisa e leva para cadastrar o CPF", async () => {
    reserveTicket.mockRejectedValue(nestError(403, "Cadastre seu CPF antes de reservar ingressos", "Forbidden"));
    const { button } = setup();
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("Cadastre seu CPF antes de reservar ingressos");
    expect(toast.error).toHaveBeenCalledWith("Cadastre seu CPF antes de reservar ingressos");
    expect(push).toHaveBeenCalledWith("/profile?redirect=%2Fevents%2F4");
    expect(screen.getByRole("link", { name: "Cadastrar CPF" })).toHaveAttribute(
      "href",
      "/profile?redirect=%2Fevents%2F4",
    );
  });

  it("409: mostra a mensagem do backend (limite/esgotado) sem redirecionar", async () => {
    const message = "Não foi possível reservar o ingresso, seu cpf atingiu o limite de ingressos para esse evento!";
    reserveTicket.mockRejectedValue(nestError(409, message, "Conflict"));
    const { button, onReserved } = setup();
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(push).not.toHaveBeenCalled();
    expect(onReserved).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Cadastrar CPF" })).not.toBeInTheDocument();
  });

  it("404: mostra que o evento não existe", async () => {
    reserveTicket.mockRejectedValue(nestError(404, "O evento 4 não foi encontrado", "Not Found"));
    const { button } = setup();
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("O evento 4 não foi encontrado");
  });

  it("respeita a prop disabled (evento esgotado/iniciado)", () => {
    expect(setup({ disabled: true }).button).toBeDisabled();
  });
});
