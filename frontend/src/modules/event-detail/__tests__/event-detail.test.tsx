import { render, screen } from "@testing-library/react";
import { makeEvent, nestError, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { EventDetail } from "../components/event-detail";
import { eventDetailService } from "../services/event-detail.service";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/event-detail.service", () => ({
  eventDetailService: { getEvent: jest.fn(), getTicketStatus: jest.fn(), reserveTicket: jest.fn() },
}));

const svc = jest.mocked(eventDetailService);

describe("<EventDetail />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(useSession).mockReturnValue(sessionValue(null));
  });

  it("mostra o evento e o status dos ingressos", async () => {
    svc.getEvent.mockResolvedValue(makeEvent({ id: 2, name: "Stand-up", location: "Teatro Municipal" }));
    svc.getTicketStatus.mockResolvedValue({ total: 100, available: 60, reserved: 40 });
    render(<EventDetail eventId={2} />);

    expect(await screen.findByText("Stand-up")).toBeInTheDocument();
    expect(screen.getByText("Teatro Municipal")).toBeInTheDocument();
    expect(await screen.findByText("60")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Disponíveis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reservar ingresso/i })).toBeEnabled();
  });

  it("marca como esgotado e desabilita a reserva", async () => {
    svc.getEvent.mockResolvedValue(makeEvent());
    svc.getTicketStatus.mockResolvedValue({ total: 10, available: 0, reserved: 10 });
    render(<EventDetail eventId={1} />);

    expect(await screen.findByText("Esgotado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reservar ingresso/i })).toBeDisabled();
  });

  it("mostra 'Evento não encontrado' no 404", async () => {
    svc.getEvent.mockRejectedValue(nestError(404, "O evento 99 não foi encontrado"));
    svc.getTicketStatus.mockRejectedValue(nestError(404, "O evento 99 não foi encontrado"));
    render(<EventDetail eventId={99} />);

    expect(await screen.findByText("Evento não encontrado")).toBeInTheDocument();
    expect(screen.getByText("O evento 99 não foi encontrado")).toBeInTheDocument();
  });
});
