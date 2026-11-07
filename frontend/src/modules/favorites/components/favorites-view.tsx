"use client";

import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useNow } from "@/shared/hooks/useNow";
import { isComingSoon } from "@/shared/lib/event-sales";
import type { EventResponse } from "@/shared/types/event";
import { EventCard } from "@/modules/events/components/event-card";
import { useFavorites } from "../hooks/useFavorites";

function Section({
  title,
  description,
  events,
}: {
  title: string;
  description: string;
  events: EventResponse[];
}) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Aba Favoritos: "Em breve" (com aviso por email) e "À venda". */
export function FavoritesView() {
  const { events, loading, error, reload } = useFavorites();
  const now = useNow();
  const comingSoon =
    now === null ? [] : events.filter((event) => isComingSoon(event, now));
  const onSale = events.filter((event) => !comingSoon.includes(event));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Favoritos</h1>
        <p className="text-muted-foreground">
          Eventos que você guardou para comprar depois.
        </p>
      </div>

      {loading && events.length === 0 ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os favoritos</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void reload()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : events.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Você ainda não favoritou nenhum evento.</p>
          <Button asChild variant="outline">
            <Link href="/">Ver eventos</Link>
          </Button>
        </div>
      ) : (
        <>
          <Section
            title="Em breve"
            description="Avisamos por email 1 hora antes de as vendas abrirem."
            events={comingSoon}
          />
          <Section
            title="À venda"
            description="Já dá para garantir o seu ingresso."
            events={onSale}
          />
        </>
      )}
    </div>
  );
}
