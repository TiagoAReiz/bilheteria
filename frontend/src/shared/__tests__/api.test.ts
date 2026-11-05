import { nestError } from "@test/helpers";
import { api, handleUnauthorized } from "@/shared/services/api";
import { hardRedirect } from "@/shared/lib/navigation";

jest.mock("@/shared/lib/navigation", () => ({ hardRedirect: jest.fn() }));

describe("instância axios", () => {
  beforeEach(() => {
    jest.mocked(hardRedirect).mockClear();
    window.history.pushState({}, "", "/");
  });

  it("envia cookies e usa a URL da API", () => {
    expect(api.defaults.withCredentials).toBe(true);
    expect(api.defaults.baseURL).toBe("http://localhost:3000");
  });

  it("em 401 redireciona para /login com a rota atual", async () => {
    window.history.pushState({}, "", "/profile?x=1");
    await expect(handleUnauthorized(nestError(401))).rejects.toBeDefined();
    expect(hardRedirect).toHaveBeenCalledWith(
      "/login?redirect=%2Fprofile%3Fx%3D1",
    );
  });

  it("não redireciona se já estiver no /login", async () => {
    window.history.pushState({}, "", "/login");
    await expect(handleUnauthorized(nestError(401))).rejects.toBeDefined();
    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it("não redireciona em outros erros e repassa o erro", async () => {
    const error = nestError(409, "Esgotado");
    await expect(handleUnauthorized(error)).rejects.toBe(error);
    expect(hardRedirect).not.toHaveBeenCalled();
  });
});
