import { makeUser } from "@test/helpers";
import { api } from "@/shared/services/api";
import { profileService } from "../services/profile.service";

jest.mock("@/shared/services/api", () => ({
  api: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

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

  it("avatar: upload-url, confirmação e remoção", async () => {
    jest.mocked(api.post).mockResolvedValue({ data: { key: "users/u/avatar/a.png" } });
    jest.mocked(api.put).mockResolvedValue({ data: { avatar_url: "http://cdn/a.png" } });
    jest.mocked(api.delete).mockResolvedValue({ data: { avatar_url: "https://google/foto.jpg" } });

    await expect(profileService.createAvatarUpload("image/png")).resolves.toEqual({ key: "users/u/avatar/a.png" });
    expect(api.post).toHaveBeenCalledWith("/users/me/avatar/upload-url", { content_type: "image/png" });
    await expect(profileService.confirmAvatar("users/u/avatar/a.png")).resolves.toEqual({ avatar_url: "http://cdn/a.png" });
    expect(api.put).toHaveBeenCalledWith("/users/me/avatar", { key: "users/u/avatar/a.png" });
    await expect(profileService.removeAvatar()).resolves.toEqual({ avatar_url: "https://google/foto.jpg" });
    expect(api.delete).toHaveBeenCalledWith("/users/me/avatar");
  });
});
