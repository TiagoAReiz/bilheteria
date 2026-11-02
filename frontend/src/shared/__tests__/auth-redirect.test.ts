import {
  buildLoginUrl,
  getAuthRedirect,
  hasSessionCookie,
  isPrivatePath,
  safeRedirectPath,
} from "@/shared/lib/auth-redirect";

describe("auth-redirect (lógica do proxy)", () => {
  describe("isPrivatePath", () => {
    it.each(["/profile", "/profile/x", "/events/new"])("%s é privada", (p) => {
      expect(isPrivatePath(p)).toBe(true);
    });

    it.each(["/", "/login", "/events/1", "/events/newer", "/profiles"])("%s é pública", (p) => {
      expect(isPrivatePath(p)).toBe(false);
    });
  });

  describe("hasSessionCookie", () => {
    it("reconhece o cookie do Better Auth em HTTP", () => {
      expect(hasSessionCookie(["foo", "better-auth.session_token"])).toBe(true);
    });

    it("reconhece o cookie com prefixo __Secure- (HTTPS)", () => {
      expect(hasSessionCookie(["__Secure-better-auth.session_token"])).toBe(true);
    });

    it("ignora outros cookies", () => {
      expect(hasSessionCookie(["better-auth.session_data", "x"])).toBe(false);
      expect(hasSessionCookie([])).toBe(false);
    });
  });

  describe("getAuthRedirect", () => {
    it("redireciona rota privada sem sessão para /login com redirect", () => {
      expect(getAuthRedirect({ pathname: "/profile", hasSession: false })).toBe("/login?redirect=%2Fprofile");
    });

    it("preserva a query string no redirect", () => {
      expect(getAuthRedirect({ pathname: "/profile", search: "?redirect=/events/2", hasSession: false })).toBe(
        `/login?redirect=${encodeURIComponent("/profile?redirect=/events/2")}`,
      );
    });

    it("deixa passar rota privada com sessão", () => {
      expect(getAuthRedirect({ pathname: "/events/new", hasSession: true })).toBeNull();
    });

    it("deixa passar rota pública sem sessão", () => {
      expect(getAuthRedirect({ pathname: "/events/3", hasSession: false })).toBeNull();
    });
  });

  describe("safeRedirectPath", () => {
    it("aceita caminhos internos", () => {
      expect(safeRedirectPath("/events/1?x=1")).toBe("/events/1?x=1");
    });

    it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"])(
      "rejeita %p",
      (value) => {
        expect(safeRedirectPath(value)).toBe("/");
      },
    );
  });

  it("buildLoginUrl codifica o destino", () => {
    expect(buildLoginUrl("/events/1")).toBe("/login?redirect=%2Fevents%2F1");
  });
});
