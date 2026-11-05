import { api } from "@/shared/services/api";
import { loginService } from "../services/login.service";

jest.mock("@/shared/services/api", () => ({ api: { post: jest.fn() } }));

describe("loginService", () => {
  it("signInSocial envia provider e callbackURL", async () => {
    jest.mocked(api.post).mockResolvedValue({
      data: { url: "https://accounts.google.com/x", redirect: true },
    });
    await expect(
      loginService.signInSocial("google", "http://localhost:3001/"),
    ).resolves.toEqual({
      url: "https://accounts.google.com/x",
      redirect: true,
    });
    expect(api.post).toHaveBeenCalledWith("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "http://localhost:3001/",
    });
  });
});
