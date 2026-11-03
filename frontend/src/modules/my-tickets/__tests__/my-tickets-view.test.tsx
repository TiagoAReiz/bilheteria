import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nestError } from "@test/helpers";
import { MyTicketsView } from "../components/my-tickets-view";
import { myTicketsService } from "../services/my-tickets.service";
import type { MyTicketResponse } from "../types/my-tickets.dto";

jest.mock("../services/my-tickets.service", () => ({ myTicketsService: { list: jest.fn() } }));
jest.mock("@/modules/payment/components/pay-ticket-button", () => ({
  PayTicketButton: ({ ticketId }: { ticketId: number }) => <button>Pagar {ticketId}</button>,
}));

const list = jest.mocked(myTicketsService.list);
const event = { id: 1, name: "Show de Teste", location: "Arena", starts_at: "2099-12-20T20:00:00.000Z" };

const paid: MyTicketResponse = { id: 3, status: "paid", reserved_until: null, event };
const reserved: MyTicketResponse = { id: 4, status: "reserved", reserved_until: "2099-01-01T00:05:00.000Z", event };

describe("<MyTicketsView />", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra pago com selo e reserva com o botão de pagar", async () => {
    list.mockResolvedValue([paid, reserved]);
    render(<MyTicketsView />);

    expect(await screen.findByText("Pago")).toBeInTheDocument();
    expect(screen.getByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar 4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar 3" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Show de Teste" })[0]).toHaveAttribute("href", "/events/1");
  });

  it("sem ingressos: convida a ver eventos", async () => {
    list.mockResolvedValue([]);
    render(<MyTicketsView />);

    expect(await screen.findByText("Você ainda não tem ingressos.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver eventos" })).toHaveAttribute("href", "/");
  });

  it("erro: mostra a mensagem e permite tentar de novo", async () => {
    list.mockRejectedValueOnce(nestError(500, "Falhou")).mockResolvedValueOnce([paid]);
    render(<MyTicketsView />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar suas reservas");
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Pago")).toBeInTheDocument();
  });
});
