"use client";

import { useParams } from "next/navigation";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { EventDetail } from "./event-detail";

/** Lê o `[id]` da rota e valida antes de renderizar o detalhe. */
export function EventDetailView() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params?.id);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Evento inválido</AlertTitle>
        <AlertDescription>
          O identificador do evento na URL não é válido.
        </AlertDescription>
      </Alert>
    );
  }

  return <EventDetail key={eventId} eventId={eventId} />;
}
