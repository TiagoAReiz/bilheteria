"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useCreateEvent } from "../hooks/useCreateEvent";
import { MAX_CAPACITY, newEventSchema, toCreateEventRequest, type NewEventFormValues } from "../types/new-event.schema";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function NewEventForm() {
  const router = useRouter();
  const { create, loading } = useCreateEvent();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewEventFormValues>({
    resolver: zodResolver(newEventSchema),
    defaultValues: { name: "", description: "", location: "", starts_at: "" },
  });

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
        <CardDescription>Os ingressos são gerados automaticamente de acordo com a capacidade.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" aria-invalid={!!errors.name || undefined} aria-describedby="name-error" {...register("name")} />
            <FieldError id="name-error" message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea id="description" rows={4} {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Local</Label>
            <Input
              id="location"
              aria-invalid={!!errors.location || undefined}
              aria-describedby="location-error"
              {...register("location")}
            />
            <FieldError id="location-error" message={errors.location?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="starts_at">Data e horário</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                aria-invalid={!!errors.starts_at || undefined}
                aria-describedby="starts_at-error"
                {...register("starts_at")}
              />
              <FieldError id="starts_at-error" message={errors.starts_at?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacidade</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={MAX_CAPACITY}
                step={1}
                aria-invalid={!!errors.capacity || undefined}
                aria-describedby="capacity-error"
                {...register("capacity", { valueAsNumber: true })}
              />
              <FieldError id="capacity-error" message={errors.capacity?.message} />
            </div>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {loading ? "Criando..." : "Criar evento"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
