"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  makeEventSchema,
  MAX_CAPACITY,
  MAX_TICKETS_PER_CPF,
  MIN_TICKETS_PER_CPF,
  type EventFormFloors,
  type NewEventFormValues,
} from "../types/new-event.schema";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

interface EventFormProps {
  defaultValues: NewEventFormValues;
  /** Na edição: valores atuais de capacidade e limite, que só podem aumentar. */
  floors?: EventFormFloors;
  submitLabel: string;
  submittingLabel: string;
  loading: boolean;
  onSubmit: (values: NewEventFormValues) => Promise<void> | void;
}

/** Campos do evento, compartilhados entre criar e editar. */
export function EventForm({ defaultValues, floors, submitLabel, submittingLabel, loading, onSubmit }: EventFormProps) {
  const editing = Boolean(floors);
  const minCapacity = floors?.minCapacity ?? 1;
  const minTicketsPerCpf = floors?.minTicketsPerCpf ?? MIN_TICKETS_PER_CPF;
  const schema = useMemo(() => makeEventSchema({ minCapacity, minTicketsPerCpf }), [minCapacity, minTicketsPerCpf]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewEventFormValues>({ resolver: zodResolver(schema), defaultValues });

  return (
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
            min={minCapacity}
            max={MAX_CAPACITY}
            step={1}
            aria-invalid={!!errors.capacity || undefined}
            aria-describedby={editing ? "capacity-hint capacity-error" : "capacity-error"}
            {...register("capacity", { valueAsNumber: true })}
          />
          {editing ? (
            <p id="capacity-hint" className="text-sm text-muted-foreground">
              Só pode aumentar: os ingressos novos entram à venda na hora.
            </p>
          ) : null}
          <FieldError id="capacity-error" message={errors.capacity?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">Preço do ingresso (R$)</Label>
          <Input
            id="price"
            inputMode="decimal"
            placeholder="50,00"
            autoComplete="off"
            aria-invalid={!!errors.price || undefined}
            aria-describedby="price-hint price-error"
            {...register("price")}
          />
          <p id="price-hint" className="text-sm text-muted-foreground">
            Preço único para todos os ingressos do evento, cobrado pelo Mercado Pago.
          </p>
          <FieldError id="price-error" message={errors.price?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_tickets_per_cpf">Ingressos por CPF</Label>
          <Input
            id="max_tickets_per_cpf"
            type="number"
            min={minTicketsPerCpf}
            max={MAX_TICKETS_PER_CPF}
            step={1}
            aria-invalid={!!errors.max_tickets_per_cpf || undefined}
            aria-describedby="max_tickets_per_cpf-hint max_tickets_per_cpf-error"
            {...register("max_tickets_per_cpf", { valueAsNumber: true })}
          />
          <p id="max_tickets_per_cpf-hint" className="text-sm text-muted-foreground">
            {editing
              ? `Só pode aumentar (até ${MAX_TICKETS_PER_CPF}): diminuir o limite não é permitido.`
              : `Quantos ingressos cada pessoa (CPF) pode reservar ou comprar neste evento, de ${MIN_TICKETS_PER_CPF} a ${MAX_TICKETS_PER_CPF}. Depois de criado, o limite só pode aumentar.`}
          </p>
          <FieldError id="max_tickets_per_cpf-error" message={errors.max_tickets_per_cpf?.message} />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        {loading ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}
