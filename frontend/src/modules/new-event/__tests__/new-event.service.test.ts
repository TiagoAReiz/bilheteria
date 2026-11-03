import { makeEvent } from "@test/helpers";
import { api } from "@/shared/services/api";
import { newEventService } from "../services/new-event.service";

jest.mock("@/shared/services/api", () => ({ api: { post: jest.fn() } }));

describe("newEventService", () => {
  it("create envia POST /events", async () => {
    const body = { name: "A", location: "B", starts_at: "2099-01-01T00:00:00.000Z", capacity: 10, price_cents: 5000 };
    jest.mocked(api.post).mockResolvedValue({ data: makeEvent({ id: 11 }) });
    await expect(newEventService.create(body)).resolves.toMatchObject({ id: 11 });
    expect(api.post).toHaveBeenCalledWith("/events", body);
  });
});
