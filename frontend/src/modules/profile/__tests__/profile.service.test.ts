import { makeUser } from "@test/helpers";
import { api } from "@/shared/services/api";
import { profileService } from "../services/profile.service";

jest.mock("@/shared/services/api", () => ({ api: { get: jest.fn(), patch: jest.fn() } }));

describe("profileService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("getMe busca GET /users/me", async () => {
    const user = makeUser();
    jest.mocked(api.get).mockResolvedValue({ data: user });
    await expect(profileService.getMe()).resolves.toEqual(user);
    expect(api.get).toHaveBeenCalledWith("/users/me");
  });

  it("registerCpf envia PATCH /users/me/cpf", async () => {
    jest.mocked(api.patch).mockResolvedValue({ status: 204 });
    await profileService.registerCpf("52998224725");
    expect(api.patch).toHaveBeenCalledWith("/users/me/cpf", { cpf: "52998224725" });
  });

  it("becomeOrganizer envia PATCH /users/me/organizer", async () => {
    jest.mocked(api.patch).mockResolvedValue({ status: 204 });
    await profileService.becomeOrganizer();
    expect(api.patch).toHaveBeenCalledWith("/users/me/organizer");
  });
});
