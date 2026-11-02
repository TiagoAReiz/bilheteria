import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { makeUser } from "@test/helpers";
import { SessionProvider, useSession } from "@/shared/hooks/useSession";
import { sessionService } from "@/shared/services/session.service";

jest.mock("@/shared/services/session.service", () => ({
  sessionService: { getSession: jest.fn(), signOut: jest.fn() },
}));

const getSession = jest.mocked(sessionService.getSession);
const signOut = jest.mocked(sessionService.signOut);
const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

describe("useSession", () => {
  beforeEach(() => jest.resetAllMocks());

  it("carrega o usuário logado", async () => {
    const user = makeUser();
    getSession.mockResolvedValue({ session: { id: "s", userId: user.id, expiresAt: "" }, user });

    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.user).toEqual(user);
  });

  it("fica deslogado quando a sessão é null", async () => {
    getSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(result.current.user).toBeNull();
  });

  it("fica deslogado quando a requisição falha", async () => {
    getSession.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
  });

  it("signOut limpa o usuário", async () => {
    const user = makeUser();
    getSession.mockResolvedValue({ session: { id: "s", userId: user.id, expiresAt: "" }, user });
    signOut.mockResolvedValue();
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    await act(() => result.current.signOut());
    expect(signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe("unauthenticated");
  });

  it("lança erro fora do provider", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});
