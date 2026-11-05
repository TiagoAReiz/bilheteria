import { api } from "@/shared/services/api";
import { editEventService } from "../services/edit-event.service";
import { toUpdateEventRequest } from "../types/edit-event.dto";

jest.mock("@/shared/services/api", () => ({
  api: { get: jest.fn(), patch: jest.fn() },
}));

describe("editEventService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("update faz PATCH /events/:id com o body", async () => {
    jest.mocked(api.patch).mockResolvedValue({ data: { id: 3 } });
    await expect(
      editEventService.update(3, { max_tickets_per_cpf: 4 }),
    ).resolves.toEqual({ id: 3 });
    expect(api.patch).toHaveBeenCalledWith("/events/3", {
      max_tickets_per_cpf: 4,
    });
  });

  it("getEvent faz GET /events/:id", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: { id: 3 } });
    await expect(editEventService.getEvent(3)).resolves.toEqual({ id: 3 });
    expect(api.get).toHaveBeenCalledWith("/events/3");
  });
});

describe("toUpdateEventRequest", () => {
  it("manda todos os campos e descrição vazia vira null (apaga)", () => {
    expect(
      toUpdateEventRequest({
        name: "Show",
        description: "",
        location: "Arena",
        starts_at: "2099-06-01T20:00",
        capacity: 10,
        price: "50,00",
        max_tickets_per_cpf: 3,
      }),
    ).toEqual({
      name: "Show",
      description: null,
      location: "Arena",
      starts_at: new Date("2099-06-01T20:00").toISOString(),
      capacity: 10,
      price_cents: 5000,
      max_tickets_per_cpf: 3,
    });
  });
});
