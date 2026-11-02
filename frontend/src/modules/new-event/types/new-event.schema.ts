import { z } from "zod";
import type { CreateEventRequest } from "./new-event.dto";

export const MAX_CAPACITY = 100000;

export const newEventSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do evento"),
  description: z.string().trim().optional(),
  location: z.string().trim().min(1, "Informe o local"),
  starts_at: z
    .string()
    .min(1, "Informe a data e o horário")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida")
    .refine((v) => new Date(v).getTime() > Date.now(), "A data precisa ser no futuro"),
  capacity: z
    .number({ error: "Informe a capacidade" })
    .int("A capacidade deve ser um número inteiro")
    .min(1, "A capacidade mínima é 1")
    .max(MAX_CAPACITY, `A capacidade máxima é ${MAX_CAPACITY.toLocaleString("pt-BR")}`),
});

export type NewEventFormValues = z.infer<typeof newEventSchema>;

/** Converte os valores do formulário (datetime-local no fuso do navegador) no body da API. */
export function toCreateEventRequest(values: NewEventFormValues): CreateEventRequest {
  return {
    name: values.name,
    description: values.description ? values.description : undefined,
    location: values.location,
    starts_at: new Date(values.starts_at).toISOString(),
    capacity: values.capacity,
  };
}
