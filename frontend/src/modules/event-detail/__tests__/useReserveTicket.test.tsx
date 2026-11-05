import { act, renderHook } from "@testing-library/react";
import { nestError } from "@test/helpers";
import {
  getReservationExpiry,
  useReserveTicket,
} from "../hooks/useReserveTicket";
import { eventDetailService } from "../services/event-detail.service";

jest.mock("../services/event-detail.service", () => ({
  eventDetailService: { reserveTicket: jest.fn() },
}));
const reserveTicket = jest.mocked(eventDetailService.reserveTicket);

describe("useReserveTicket", () => {
  beforeEach(() => jest.resetAllMocks());

  it("reserva e calcula a expiração em 5 minutos", async () => {
    reserveTicket.mockResolvedValue({
      id: 1,
      user_id: "u",
      event_id: 5,
      reserved_at: "2099-01-01T10:00:00.000Z",
      is_paid: false,
    });
    const { result } = renderHook(() => useReserveTicket(5));

    await act(async () => {
      await result.current.reserve();
    });

    expect(reserveTicket).toHaveBeenCalledWith(5);
    expect(result.current.result?.ticket.id).toBe(1);
    expect(result.current.result?.expiresAt.toISOString()).toBe(
      "2099-01-01T10:05:00.000Z",
    );
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it.each([
    [403, "cpf_required", "Cadastre seu CPF antes de reservar ingressos"],
    [409, "conflict", "Não há ingressos disponíveis para o evento 5"],
    [404, "not_found", "O evento 5 não foi encontrado"],
    [500, "unknown", "Erro interno"],
  ])("classifica o erro %i como %s", async (status, kind, message) => {
    reserveTicket.mockRejectedValue(nestError(status, message));
    const { result } = renderHook(() => useReserveTicket(5));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.reserve();
    });

    expect(outcome).toEqual({ kind, message });
    expect(result.current.error).toEqual({ kind, message });
    expect(result.current.result).toBeNull();
  });

  it("getReservationExpiry usa agora quando reserved_at é null", () => {
    const now = new Date("2099-01-01T00:00:00.000Z");
    expect(getReservationExpiry(null, now).toISOString()).toBe(
      "2099-01-01T00:05:00.000Z",
    );
  });
});
