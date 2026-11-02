import { makeEvent } from "@test/helpers";
import { api } from "@/shared/services/api";
import { eventDetailService } from "../services/event-detail.service";

jest.mock("@/shared/services/api", () => ({ api: { get: jest.fn(), post: jest.fn() } }));

describe("eventDetailService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("getEvent busca GET /events/:id", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: makeEvent({ id: 3 }) });
    await expect(eventDetailService.getEvent(3)).resolves.toMatchObject({ id: 3 });
    expect(api.get).toHaveBeenCalledWith("/events/3");
  });

  it("getTicketStatus busca GET /status/:eventId", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: { total: 10, available: 7, reserved: 3 } });
    await expect(eventDetailService.getTicketStatus(3)).resolves.toEqual({ total: 10, available: 7, reserved: 3 });
    expect(api.get).toHaveBeenCalledWith("/status/3");
  });

  it("reserveTicket envia POST /reservation com event_id", async () => {
    const ticket = { id: 9, user_id: "u", event_id: 3, reserved_at: "2099-01-01T00:00:00.000Z", is_paid: false };
    jest.mocked(api.post).mockResolvedValue({ data: ticket });
    await expect(eventDetailService.reserveTicket(3)).resolves.toEqual(ticket);
    expect(api.post).toHaveBeenCalledWith("/reservation", { event_id: 3 });
  });
});
