"use client";

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
import { useEvents } from "../hooks/useEvents";
import { EventCard } from "./event-card";

function EventGrid({ events }: { events: EventResponse[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li key={event.id}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}

/** "Em breve": vendas com data marcada que ainda não abriram. Some quando não há nenhum. */
function ComingSoonSection({ events }: { events: EventResponse[] }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-6" aria-labelledby="coming-soon-title">
      <div>
        <h2
          id="coming-soon-title"
          className="text-3xl font-bold tracking-tight"
        >
          Em breve
        </h2>
        <p className="text-muted-foreground">
          Favorite para receber um email 1 hora antes de as vendas abrirem.
        </p>
      </div>
      <EventGrid events={events} />
    </section>
  );
}

export function EventList() {
  const { events, loading, error, reload } = useEvents();
  const now = useNow();
  // até o relógio ser lido (só no navegador) ninguém é "em breve"
  const comingSoon =
    now === null ? [] : events.filter((event) => isComingSoon(event, now));
  const onSale = events.filter((event) => !comingSoon.includes(event));

  return (
    <div className="space-y-10">
      {loading || error ? null : <ComingSoonSection events={comingSoon} />}
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Próximos eventos
          </h1>
          <p className="text-muted-foreground">
            Escolha um evento e garanta seu ingresso.
          </p>
        </div>

        {loading ? (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            data-testid="events-loading"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível carregar os eventos</AlertTitle>
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
        ) : onSale.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            {comingSoon.length === 0
              ? "Nenhum evento programado no momento."
              : "Nenhum evento à venda no momento."}
          </p>
        ) : (
          <EventGrid events={onSale} />
        )}
      </section>
    </div>
  );
}
