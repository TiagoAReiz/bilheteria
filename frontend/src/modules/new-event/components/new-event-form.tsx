"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useCreateEvent } from "../hooks/useCreateEvent";
import {
  DEFAULT_TICKETS_PER_CPF,
  toCreateEventRequest,
  type NewEventFormValues,
} from "../types/new-event.schema";
import {
  uploadEventImages,
  type PendingEventImages,
} from "../services/upload-event-images";
import { EventForm } from "./event-form";
import { EventImagesPicker } from "./event-images-picker";

const EMPTY: NewEventFormValues = {
  name: "",
  description: "",
  location: "",
  starts_at: "",
  price: "",
  max_tickets_per_cpf: DEFAULT_TICKETS_PER_CPF,
  sales_starts_at: "",
} as NewEventFormValues;

export function NewEventForm() {
  const router = useRouter();
  const { create, loading } = useCreateEvent();
  const [images, setImages] = useState<PendingEventImages>({
    cover: null,
    photos: [],
  });
  const [uploading, setUploading] = useState(false);

  async function onSubmit(values: NewEventFormValues) {
    const result = await create(toCreateEventRequest(values));
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const eventId = result.event.id;
    if (images.cover || images.photos.length > 0) {
      setUploading(true);
      const failures = await uploadEventImages(eventId, images);
      setUploading(false);
      if (failures.length > 0) {
        // o evento já existe: o que faltou pode ser reenviado na página dele
        toast.warning(
          `Evento criado, mas ${failures.length === 1 ? "1 imagem não foi enviada" : `${failures.length} imagens não foram enviadas`}: ${failures
            .map((f) => `${f.name} (${f.message})`)
            .join("; ")}. Reenvie na página do evento.`,
        );
        router.push(`/events/${eventId}`);
        return;
      }
    }
    toast.success("Evento criado com sucesso!");
    router.push(`/events/${eventId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo evento</CardTitle>
        <CardDescription>
          Os ingressos são gerados automaticamente de acordo com a capacidade.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EventForm
          defaultValues={EMPTY}
          submitLabel="Criar evento"
          submittingLabel={uploading ? "Enviando imagens..." : "Criando..."}
          loading={loading || uploading}
          onSubmit={onSubmit}
        >
          <EventImagesPicker
            value={images}
            onChange={setImages}
            disabled={loading || uploading}
          />
        </EventForm>
      </CardContent>
    </Card>
  );
}
