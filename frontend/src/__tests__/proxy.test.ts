/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3001"), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy", () => {
  it("redireciona para /login quando não há cookie de sessão", () => {
    const res = proxy(request("/profile"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3001/login?redirect=%2Fprofile");
  });

  it("segue quando há cookie de sessão", () => {
    const res = proxy(request("/events/new", "better-auth.session_token=abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("aceita o cookie com prefixo __Secure-", () => {
    const res = proxy(request("/profile", "__Secure-better-auth.session_token=abc"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("só roda nas rotas privadas", () => {
    expect(config.matcher).toEqual(["/profile/:path*", "/events/new", "/payment/:path*"]);
  });
});
