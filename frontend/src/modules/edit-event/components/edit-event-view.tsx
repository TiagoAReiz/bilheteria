"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useAsync } from "@/shared/hooks/useAsync";
import { useSession } from "@/shared/hooks/useSession";
import type { EventResponse } from "@/shared/types/event";
import type { User } from "@/shared/types/user";
import { EventForm } from "@/modules/new-event/components/event-form";
import { toEventFormValues, type NewEventFormValues } from "@/modules/new-event/types/new-event.schema";
import { useUpdateEvent } from "../hooks/useUpdateEvent";
import { editEventService } from "../services/edit-event.service";
import { toUpdateEventRequest } from "../types/edit-event.dto";

/** Só o organizador que criou o evento (ou um ADMIN) edita; a API confere de novo. */
export function canEditEvent(user: Pick<User, "id" | "role"> | null, event: Pick<EventResponse, "organizer_id">) {
  return Boolean(user && (user.role === "ADMIN" || user.id === event.organizer_id));
}

export function hasStarted(event: Pick<EventResponse, "starts_at">, now = Date.now()) {
  return new Date(event.starts_at).getTime() <= now;
}

/** Lê o `[id]` da rota e mostra o formulário de edição. */
export function EditEventView() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params?.id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={Number.isInteger(eventId) && eventId > 0 ? `/events/${eventId}` : "/"}>
          <ArrowLeftIcon aria-hidden /> Voltar para o evento
        </Link>
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">Editar evento</h1>
      {Number.isInteger(eventId) && eventId > 0 ? (
        <EditEvent key={eventId} eventId={eventId} />
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Evento inválido</AlertTitle>
          <AlertDescription>O identificador do evento na URL não é válido.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function EditEvent({ eventId }: { eventId: number }) {
  const router = useRouter();
  const { user, status: sessionStatus } = useSession();
  const { data: event, loading, error, status, reload } = useAsync(() => editEventService.getEvent(eventId), eventId);
  const { update, loading: saving } = useUpdateEvent(eventId);

  if (loading || sessionStatus === "loading") return <Skeleton className="h-96 w-full" />;

  if (error || !event) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{status === 404 ? "Evento não encontrado" : "Não foi possível carregar o evento"}</AlertTitle>
        <AlertDescription>
          <p>{error}</p>
          {status === 404 ? null : (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void reload()}>
              Tentar novamente
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!canEditEvent(user, event)) {
    return (
      <Alert>
        <AlertTitle>Você não pode editar este evento</AlertTitle>
        <AlertDescription>Só o organizador que criou o evento pode editá-lo.</AlertDescription>
      </Alert>
    );
  }

  if (hasStarted(event)) {
    return (
      <Alert>
        <AlertTitle>Este evento já começou</AlertTitle>
        <AlertDescription>Eventos que já começaram não podem mais ser editados.</AlertDescription>
      </Alert>
    );
  }

  async function onSubmit(values: NewEventFormValues) {
    const result = await update(toUpdateEventRequest(values));
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Evento atualizado!");
    router.push(`/events/${eventId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{event.name}</CardTitle>
        <CardDescription>
          A capacidade e o limite de ingressos por CPF só podem aumentar. Quem já reservou ou comprou não é afetado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EventForm
          defaultValues={toEventFormValues(event)}
          floors={{ minCapacity: event.capacity, minTicketsPerCpf: event.max_tickets_per_cpf }}
          submitLabel="Salvar alterações"
          submittingLabel="Salvando..."
          loading={saving}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
}
