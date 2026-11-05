"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sessionService } from "@/shared/services/session.service";
import type { User } from "@/shared/types/user";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionContextValue {
  user: User | null;
  status: SessionStatus;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      const data = await sessionService.getSession();
      setUser(data?.user ?? null);
      setStatus(data?.user ? "authenticated" : "unauthenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await sessionService.signOut();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    // carrega a sessão ao montar; o setState acontece depois do await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, status, refresh, signOut }),
    [user, status, refresh, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error("useSession precisa estar dentro de <SessionProvider>");
  return ctx;
}
