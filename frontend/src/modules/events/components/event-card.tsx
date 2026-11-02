import Link from "next/link";
import { CalendarIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { formatDateTime } from "@/shared/lib/format";
import type { EventResponse } from "@/shared/types/event";

export function EventCard({ event }: { event: EventResponse }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-lg">{event.name}</CardTitle>
        {event.description ? <CardDescription className="line-clamp-2">{event.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <MapPinIcon className="size-4 shrink-0" aria-hidden />
          {event.location}
        </p>
        <p className="flex items-center gap-2">
          <CalendarIcon className="size-4 shrink-0" aria-hidden />
          <time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time>
        </p>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/events/${event.id}`}>Ver detalhes</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
