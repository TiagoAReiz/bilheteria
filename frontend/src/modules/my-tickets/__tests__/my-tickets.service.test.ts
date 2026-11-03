import { api } from "@/shared/services/api";
import { myTicketsService } from "../services/my-tickets.service";

jest.mock("@/shared/services/api", () => ({ api: { get: jest.fn() } }));

describe("myTicketsService", () => {
  it("list consulta GET /tickets/me", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: [] });
    await expect(myTicketsService.list()).resolves.toEqual([]);
    expect(api.get).toHaveBeenCalledWith("/tickets/me");
  });
});
