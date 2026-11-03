"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, BanknoteIcon, CalendarIcon, MapPinIcon, TicketIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSession } from "@/shared/hooks/useSession";
import { formatDateTime, formatNumber } from "@/shared/lib/format";
import { formatBRL } from "@/shared/lib/money";
import type { User } from "@/shared/types/user";
import { useEventDetail } from "../hooks/useEventDetail";
import { useEventImages } from "../hooks/useEventImages";
import type { EventDetailResponse, TicketStatusResponse } from "../types/event-detail.dto";
import { EventGallery } from "./event-gallery";
import { EventImagesToolbar } from "./event-images-toolbar";
import { ReserveTicketButton } from "./reserve-ticket-button";
import { TicketStatusCard } from "./ticket-status-card";

/** Só o organizador que criou o evento (ou um ADMIN) mexe nas imagens; a API confere de novo. */
export function canEditEventImages(user: Pick<User, "id" | "role"> | null, event: Pick<EventDetailResponse, "organizer_id">) {
  return Boolean(user && (user.role === "ADMIN" || user.id === event.organizer_id));
}

async function toastFailure(operation: Promise<string | null>) {
  const failure = await operation;
  if (failure) toast.error(failure);
}

const backLink = (
  <Button asChild variant="ghost" size="sm" className="-ml-2">
    <Link href="/">
      <ArrowLeftIcon aria-hidden /> Voltar para eventos
    </Link>
  </Button>
);

export function EventDetail({ eventId }: { eventId: number }) {
  const { event, loading, error, notFound, ticketStatus, ticketStatusLoading, ticketStatusError, reloadTicketStatus } =
    useEventDetail(eventId);

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
        {backLink}
        <Alert variant="destructive">
          <AlertTitle>{notFound ? "Evento não encontrado" : "Não foi possível carregar o evento"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <EventDetailContent
      event={event}
      ticketStatus={ticketStatus}
      ticketStatusLoading={ticketStatusLoading}
      ticketStatusError={ticketStatusError}
      reloadTicketStatus={reloadTicketStatus}
    />
  );
}

function EventDetailContent({
  event,
  ticketStatus,
  ticketStatusLoading,
  ticketStatusError,
  reloadTicketStatus,
}: {
  event: EventDetailResponse;
  ticketStatus: TicketStatusResponse | null;
  ticketStatusLoading: boolean;
  ticketStatusError: string | null;
  reloadTicketStatus: () => Promise<void>;
}) {
  // momento em que a página foi aberta (usado para saber se o evento já começou)
  const [openedAt] = useState(() => Date.now());
  const { user } = useSession();
  const images = useEventImages(event.id, { cover_url: event.cover_url, photos: event.photos ?? [] });
  const canEdit = canEditEventImages(user, event);

  const started = new Date(event.starts_at).getTime() <= openedAt;
  const soldOut = ticketStatus?.available === 0;
  // evento criado antes do pagamento existir: sem preço, sem venda (o backend também recusa)
  const notOnSale = event.price_cents === null;

  return (
    <div className="space-y-6">
      {backLink}
      {images.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem do bucket (S3/LocalStack), sem otimização do Next
        <img
          src={images.coverUrl}
          alt={`Capa de ${event.name}`}
          className="aspect-[21/9] w-full rounded-xl border object-cover"
        />
      ) : null}
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-3xl">{event.name}</CardTitle>
            {soldOut ? <Badge variant="destructive">Esgotado</Badge> : null}
            {started ? <Badge variant="secondary">Vendas encerradas</Badge> : null}
            {notOnSale && !started ? <Badge variant="secondary">Vendas indisponíveis</Badge> : null}
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
            <p className="flex items-center gap-2">
              <BanknoteIcon className="size-4" aria-hidden />
              {event.price_cents === null ? (
                "Preço a definir"
              ) : (
                <span>
                  Ingresso: <strong className="text-foreground">{formatBRL(event.price_cents)}</strong>
                </span>
              )}
            </p>
            <p className="flex items-center gap-2">
              <TicketIcon className="size-4" aria-hidden />
              Limite de {event.max_tickets_per_cpf} {event.max_tickets_per_cpf === 1 ? "ingresso" : "ingressos"} por CPF
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {event.description ? <p className="whitespace-pre-line">{event.description}</p> : null}
          {canEdit ? <EventImagesToolbar images={images} /> : null}
          {images.photos.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-semibold">Fotos</h2>
              <EventGallery
                photos={images.photos}
                eventName={event.name}
                disabled={images.busy}
                onMove={canEdit ? (id, direction) => void toastFailure(images.movePhoto(id, direction)) : undefined}
                onRemove={canEdit ? (id) => void toastFailure(images.removePhoto(id)) : undefined}
              />
            </section>
          ) : null}
          <Separator />
          <section className="space-y-3">
            <h2 className="font-semibold">Ingressos</h2>
            <TicketStatusCard status={ticketStatus} loading={ticketStatusLoading} error={ticketStatusError} />
          </section>
          <ReserveTicketButton
            eventId={event.id}
            disabled={started || soldOut || notOnSale}
            onReserved={() => void reloadTicketStatus()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
