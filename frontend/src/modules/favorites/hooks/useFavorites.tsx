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
import { toast } from "sonner";
import { useSession } from "@/shared/hooks/useSession";
import { getErrorMessage } from "@/shared/lib/api-error";
import type { EventResponse } from "@/shared/types/event";
import { favoritesService } from "../services/favorites.service";

interface FavoritesContextValue {
  /** Eventos favoritados (GET /favorites); vazio sem sessão. */
  events: EventResponse[];
  loading: boolean;
  error: string | null;
  isFavorite: (eventId: number) => boolean;
  /** Favorita/desfavorita na hora (otimista) e desfaz se a API recusar. */
  toggle: (eventId: number) => Promise<void>;
  reload: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/**
 * Um único GET /favorites para a aplicação inteira: os corações dos cards, da página do evento
 * e a aba Favoritos leem daqui.
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await favoritesService.list();
      setEvents(list);
      setIds(new Set(list.map((event) => event.id)));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível carregar os favoritos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      // o setState acontece depois do await
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void reload();
    } else if (status === "unauthenticated") {
      setEvents([]);
      setIds(new Set());
    }
  }, [status, reload]);

  const isFavorite = useCallback((eventId: number) => ids.has(eventId), [ids]);

  const toggle = useCallback(
    async (eventId: number) => {
      const adding = !ids.has(eventId);
      const flip = (add: boolean) =>
        setIds((current) => {
          const next = new Set(current);
          if (add) next.add(eventId);
          else next.delete(eventId);
          return next;
        });
      flip(adding);
      try {
        if (adding) await favoritesService.add(eventId);
        else await favoritesService.remove(eventId);
        // a lista da aba Favoritos precisa dos dados do evento: busca de novo
        await reload();
      } catch (err) {
        flip(!adding);
        toast.error(
          getErrorMessage(
            err,
            adding
              ? "Não foi possível favoritar o evento."
              : "Não foi possível remover dos favoritos.",
          ),
        );
      }
    },
    [ids, reload],
  );

  const value = useMemo(
    () => ({ events, loading, error, isFavorite, toggle, reload }),
    [events, loading, error, isFavorite, toggle, reload],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

/** null fora do <FavoritesProvider> (ex.: componente renderizado isolado em teste). */
export function useOptionalFavorites(): FavoritesContextValue | null {
  return useContext(FavoritesContext);
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx)
    throw new Error("useFavorites precisa estar dentro de <FavoritesProvider>");
  return ctx;
}
