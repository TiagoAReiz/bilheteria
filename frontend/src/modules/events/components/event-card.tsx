import Link from "next/link";
import { CalendarIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { isComingSoon } from "@/shared/lib/event-sales";
import { formatDateTime, formatShortDateTime } from "@/shared/lib/format";
import { FavoriteButton } from "@/modules/favorites/components/favorite-button";
import type { EventResponse } from "@/shared/types/event";

/** O que o card precisa: serve tanto para GET /events quanto para os itens da busca. */
export type EventCardData = Pick<
  EventResponse,
  "id" | "name" | "description" | "location" | "starts_at"
> & {
  /** Capa (GET /events e busca); sem ela o card fica só com o texto. */
  cover_url?: string | null;
  /** Só a busca informa (contador aproximado); sem ele o card não mostra disponibilidade. */
  available_tickets?: number;
  /** Início das vendas; no futuro o card mostra "Em breve" e a data de abertura. */
  sales_starts_at?: string | null;
};

export function EventCard({ event }: { event: EventCardData }) {
  const comingSoon = isComingSoon(event);
  return (
    <Card className="relative flex h-full flex-col">
      <FavoriteButton
        eventId={event.id}
        eventName={event.name}
        className="absolute top-3 right-3 z-10"
      />
      {event.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem do bucket (S3/LocalStack), sem otimização do Next
        <img
          src={event.cover_url}
          alt={`Capa de ${event.name}`}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      ) : null}
      <CardHeader className="pr-14">
        <CardTitle className="text-lg">{event.name}</CardTitle>
        {event.description ? (
          <CardDescription className="line-clamp-2">
            {event.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <MapPinIcon className="size-4 shrink-0" aria-hidden />
          {event.location}
        </p>
        <p className="flex items-center gap-2">
          <CalendarIcon className="size-4 shrink-0" aria-hidden />
          <time dateTime={event.starts_at}>
            {formatDateTime(event.starts_at)}
          </time>
        </p>
        {comingSoon && event.sales_starts_at ? (
          <div className="space-y-1">
            <Badge>Em breve</Badge>
            <p className="text-foreground">
              Vendas abrem em{" "}
              <time dateTime={event.sales_starts_at}>
                {formatShortDateTime(event.sales_starts_at)}
              </time>
            </p>
          </div>
        ) : event.available_tickets ===
          undefined ? null : event.available_tickets > 0 ? (
          <Badge variant="secondary">Ingressos disponíveis</Badge>
        ) : (
          <Badge variant="destructive">Esgotado</Badge>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/events/${event.id}`}>Ver detalhes</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
