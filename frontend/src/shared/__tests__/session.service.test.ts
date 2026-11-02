import { api } from "@/shared/services/api";
import { sessionService } from "@/shared/services/session.service";

jest.mock("@/shared/services/api", () => ({ api: { get: jest.fn(), post: jest.fn() } }));

describe("sessionService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("getSession chama /api/auth/get-session", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: { session: {}, user: { id: "1" } } });
    await expect(sessionService.getSession()).resolves.toEqual({ session: {}, user: { id: "1" } });
    expect(api.get).toHaveBeenCalledWith("/api/auth/get-session");
  });

  it("getSession normaliza resposta vazia para null", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: "" });
    await expect(sessionService.getSession()).resolves.toBeNull();
  });

  it("signOut chama /api/auth/sign-out", async () => {
    jest.mocked(api.post).mockResolvedValue({ data: { success: true } });
    await sessionService.signOut();
    expect(api.post).toHaveBeenCalledWith("/api/auth/sign-out", {});
  });
});
