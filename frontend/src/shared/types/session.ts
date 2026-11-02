import type { User } from "./user";

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  token?: string;
}

/** Resposta de GET /api/auth/get-session. */
export type SessionResponse = { session: Session; user: User } | null;
