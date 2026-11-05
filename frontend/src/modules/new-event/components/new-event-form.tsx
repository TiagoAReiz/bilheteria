"use client";

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
import { EventForm } from "./event-form";

const EMPTY: NewEventFormValues = {
  name: "",
  description: "",
  location: "",
  starts_at: "",
  price: "",
  max_tickets_per_cpf: DEFAULT_TICKETS_PER_CPF,
} as NewEventFormValues;

export function NewEventForm() {
  const router = useRouter();
  const { create, loading } = useCreateEvent();

  async function onSubmit(values: NewEventFormValues) {
    const result = await create(toCreateEventRequest(values));
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Evento criado com sucesso!");
    router.push(`/events/${result.event.id}`);
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
          submittingLabel="Criando..."
          loading={loading}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
}
