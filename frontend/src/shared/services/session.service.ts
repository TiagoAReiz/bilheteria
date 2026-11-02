import { api } from "./api";
import type { SessionResponse } from "@/shared/types/session";

export const sessionService = {
  async getSession(): Promise<SessionResponse> {
    const { data } = await api.get<SessionResponse>("/api/auth/get-session");
    // sem sessão o Better Auth pode responder null ou corpo vazio
    return data && typeof data === "object" && "user" in data ? data : null;
  },

  async signOut(): Promise<void> {
    await api.post("/api/auth/sign-out", {});
  },
};
