"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, MapPinIcon, UsersIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatDateTime, formatNumber } from "@/shared/lib/format";
import { useEventDetail } from "../hooks/useEventDetail";
import { ReserveTicketButton } from "./reserve-ticket-button";
import { TicketStatusCard } from "./ticket-status-card";

export function EventDetail({ eventId }: { eventId: number }) {
  const { event, loading, error, notFound, ticketStatus, ticketStatusLoading, ticketStatusError, reloadTicketStatus } =
    useEventDetail(eventId);
  // momento em que a página foi aberta (usado para saber se o evento já começou)
  const [openedAt] = useState(() => Date.now());

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/">
        <ArrowLeftIcon aria-hidden /> Voltar para eventos
      </Link>
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-4">
        {back}
        <Alert variant="destructive">
          <AlertTitle>{notFound ? "Evento não encontrado" : "Não foi possível carregar o evento"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const started = new Date(event.starts_at).getTime() <= openedAt;
  const soldOut = ticketStatus?.available === 0;

  return (
    <div className="space-y-6">
      {back}
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-3xl">{event.name}</CardTitle>
            {soldOut ? <Badge variant="destructive">Esgotado</Badge> : null}
            {started ? <Badge variant="secondary">Vendas encerradas</Badge> : null}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <MapPinIcon className="size-4" aria-hidden /> {event.location}
            </p>
            <p className="flex items-center gap-2">
              <CalendarIcon className="size-4" aria-hidden />
              <time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time>
            </p>
            <p className="flex items-center gap-2">
              <UsersIcon className="size-4" aria-hidden /> Capacidade: {formatNumber(event.capacity)} pessoas
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {event.description ? <p className="whitespace-pre-line">{event.description}</p> : null}
          <Separator />
          <section className="space-y-3">
            <h2 className="font-semibold">Ingressos</h2>
            <TicketStatusCard status={ticketStatus} loading={ticketStatusLoading} error={ticketStatusError} />
          </section>
          <ReserveTicketButton
            eventId={event.id}
            disabled={started || soldOut}
            onReserved={() => void reloadTicketStatus()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
