import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { makeUser, nestError, sessionValue, VALID_CPF } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { ReserveTicketButton } from "../components/reserve-ticket-button";
import { eventDetailService } from "../services/event-detail.service";
import { profileService } from "@/modules/profile/services/profile.service";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/event-detail.service", () => ({ eventDetailService: { reserveTicket: jest.fn() } }));
jest.mock("@/modules/profile/services/profile.service", () => ({ profileService: { registerCpf: jest.fn() } }));

const mockedUseSession = jest.mocked(useSession);
const reserveTicket = jest.mocked(eventDetailService.reserveTicket);
const registerCpf = jest.mocked(profileService.registerCpf);

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

  describe("sem CPF (403)", () => {
    const noCpf = () => nestError(403, "Cadastre seu CPF antes de reservar ingressos", "Forbidden");

    it("abre o modal de CPF sem sair da página", async () => {
      reserveTicket.mockRejectedValue(noCpf());
      const { button } = setup();
      await userEvent.click(button);

      expect(await screen.findByRole("dialog", { name: "Cadastre seu CPF para reservar" })).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("cadastra o CPF no modal e conclui a reserva", async () => {
      reserveTicket.mockRejectedValueOnce(noCpf()).mockResolvedValueOnce({
        id: 7,
        user_id: "u1",
        reserved_at: new Date().toISOString(),
        is_paid: false,
        event_id: 4,
      });
      registerCpf.mockResolvedValue();
      const { button, onReserved } = setup();
      await userEvent.click(button);

      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("CPF"), VALID_CPF);
      await userEvent.click(within(dialog).getByRole("button", { name: /cadastrar cpf/i }));

      expect(registerCpf).toHaveBeenCalledWith(VALID_CPF);
      expect(await screen.findByText("Reserva #7 confirmada")).toBeInTheDocument();
      expect(reserveTicket).toHaveBeenCalledTimes(2);
      expect(onReserved).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("fechar o modal deixa o aviso com o botão para reabrir", async () => {
      reserveTicket.mockRejectedValue(noCpf());
      const { button } = setup();
      await userEvent.click(button);
      await screen.findByRole("dialog");
      await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Cadastre seu CPF antes de reservar ingressos");
      await userEvent.click(screen.getByRole("button", { name: "Cadastrar CPF" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });
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
