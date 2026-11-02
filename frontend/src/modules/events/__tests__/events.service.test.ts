import { makeEvent } from "@test/helpers";
import { api } from "@/shared/services/api";
import { eventsService } from "../services/events.service";

jest.mock("@/shared/services/api", () => ({ api: { get: jest.fn() } }));

describe("eventsService", () => {
  it("listUpcoming busca GET /events", async () => {
    const events = [makeEvent()];
    jest.mocked(api.get).mockResolvedValue({ data: events });
    await expect(eventsService.listUpcoming()).resolves.toEqual(events);
    expect(api.get).toHaveBeenCalledWith("/events");
  });
});
