import { makeSearchResponse } from "@test/helpers";
import { api } from "@/shared/services/api";
import { eventSearchService } from "../services/event-search.service";

jest.mock("@/shared/services/api", () => ({ api: { get: jest.fn() } }));
const get = jest.mocked(api.get);

describe("eventSearchService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("search chama GET /events/search com os parâmetros e o sinal de cancelamento", async () => {
    const response = makeSearchResponse();
    get.mockResolvedValue({ data: response });
    const controller = new AbortController();

    await expect(
      eventSearchService.search(
        { q: "rock", available: true, page: 2, size: 12 },
        controller.signal,
      ),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/events/search", {
      params: { q: "rock", available: true, page: 2, size: 12 },
      signal: controller.signal,
    });
  });

  it("suggest chama GET /events/suggest com q", async () => {
    get.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Rock",
          location: "Arena",
          starts_at: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    await expect(eventSearchService.suggest("ro")).resolves.toHaveLength(1);
    expect(get).toHaveBeenCalledWith("/events/suggest", {
      params: { q: "ro" },
      signal: undefined,
    });
  });
});
