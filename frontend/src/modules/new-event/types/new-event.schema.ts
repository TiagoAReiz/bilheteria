import { z } from "zod";
import { formatBRL, parseReaisToCents } from "@/shared/lib/money";
import type { EventResponse } from "@/shared/types/event";
import type { CreateEventRequest } from "./new-event.dto";

export const MAX_CAPACITY = 100000;
/** Mesmos limites do backend (centavos): R$ 1,00 a R$ 100.000,00. */
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 10_000_000;
/** Mesmos limites do backend: ingressos ativos por CPF no evento. */
export const MIN_TICKETS_PER_CPF = 1;
export const MAX_TICKETS_PER_CPF = 10;
export const DEFAULT_TICKETS_PER_CPF = 2;

/**
 * Pisos da edição: capacidade e limite por CPF só aumentam (o backend recusa diminuir).
 * Na criação os pisos são os mínimos absolutos.
 */
export interface EventFormFloors {
  minCapacity?: number;
  minTicketsPerCpf?: number;
  /** Edição de evento com vendas já abertas: o início das vendas não muda mais (nem é validado). */
  salesLocked?: boolean;
}

export function makeEventSchema({
  minCapacity = 1,
  minTicketsPerCpf = MIN_TICKETS_PER_CPF,
  salesLocked = false,
}: EventFormFloors = {}) {
  return (
    z
      .object({
        name: z.string().trim().min(1, "Informe o nome do evento"),
        description: z.string().trim().optional(),
        location: z.string().trim().min(1, "Informe o local"),
        starts_at: z
          .string()
          .min(1, "Informe a data e o horário")
          .refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida")
          .refine(
            (v) => new Date(v).getTime() > Date.now(),
            "A data precisa ser no futuro",
          ),
        capacity: z
          .number({ error: "Informe a capacidade" })
          .int("A capacidade deve ser um número inteiro")
          .min(
            minCapacity,
            minCapacity === 1
              ? "A capacidade mínima é 1"
              : `A capacidade não pode diminuir (mínimo ${minCapacity})`,
          )
          .max(
            MAX_CAPACITY,
            `A capacidade máxima é ${MAX_CAPACITY.toLocaleString("pt-BR")}`,
          ),
        /** Em reais, como a pessoa digita (ex.: "50,00"); vira centavos no envio. */
        price: z
          .string()
          .trim()
          // uma mensagem por vez: a primeira regra que falhar
          .superRefine((value, ctx) => {
            const message = priceError(value);
            if (message) ctx.addIssue({ code: "custom", message });
          }),
        max_tickets_per_cpf: z
          .number({ error: "Informe o limite por CPF" })
          .int("O limite deve ser um número inteiro")
          .min(
            minTicketsPerCpf,
            minTicketsPerCpf === MIN_TICKETS_PER_CPF
              ? `O limite mínimo é ${MIN_TICKETS_PER_CPF}`
              : `O limite por CPF não pode diminuir (mínimo ${minTicketsPerCpf})`,
          )
          .max(MAX_TICKETS_PER_CPF, `O limite máximo é ${MAX_TICKETS_PER_CPF}`),
        /** Início das vendas (datetime-local). Vazio: vende desde já. */
        sales_starts_at: z.string().optional(),
      })
      // o backend recusa limite maior que a capacidade
      // (capacidade inválida já tem o próprio erro: não repete aqui)
      .refine(
        (v) =>
          !Number.isInteger(v.capacity) ||
          v.capacity < minCapacity ||
          v.max_tickets_per_cpf <= v.capacity,
        {
          path: ["max_tickets_per_cpf"],
          message: "O limite por CPF não pode ser maior que a capacidade",
        },
      )
      .superRefine((v, ctx) => {
        if (salesLocked || !v.sales_starts_at) return;
        const message = salesStartError(v.sales_starts_at, v.starts_at);
        if (message)
          ctx.addIssue({ code: "custom", path: ["sales_starts_at"], message });
      })
  );
}

/** O backend recusa abertura no passado ou depois (ou junto) do início do evento. */
function salesStartError(
  salesStartsAt: string,
  startsAt: string,
): string | undefined {
  const sales = new Date(salesStartsAt).getTime();
  if (Number.isNaN(sales)) return "Data inválida";
  if (sales <= Date.now()) return "O início das vendas precisa ser no futuro";
  const start = new Date(startsAt).getTime();
  if (!Number.isNaN(start) && sales >= start)
    return "As vendas precisam abrir antes do início do evento";
  return undefined;
}

export const newEventSchema = makeEventSchema();

function priceError(value: string): string | undefined {
  if (!value) return "Informe o preço do ingresso";
  const cents = parseReaisToCents(value);
  if (cents === null) return "Preço inválido. Use, por exemplo, 50,00";
  if (cents < MIN_PRICE_CENTS)
    return `O preço mínimo é ${formatBRL(MIN_PRICE_CENTS)}`;
  if (cents > MAX_PRICE_CENTS)
    return `O preço máximo é ${formatBRL(MAX_PRICE_CENTS)}`;
  return undefined;
}

export type NewEventFormValues = z.infer<typeof newEventSchema>;

/** Converte os valores do formulário (datetime-local no fuso do navegador) no body da API. */
export function toCreateEventRequest(
  values: NewEventFormValues,
): CreateEventRequest {
  return {
    name: values.name,
    description: values.description ? values.description : undefined,
    location: values.location,
    starts_at: new Date(values.starts_at).toISOString(),
    capacity: values.capacity,
    // o schema já garantiu um valor válido
    price_cents: parseReaisToCents(values.price) as number,
    max_tickets_per_cpf: values.max_tickets_per_cpf,
    sales_starts_at: values.sales_starts_at
      ? new Date(values.sales_starts_at).toISOString()
      : undefined,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO da API -> valor do <input type="datetime-local"> no fuso do navegador. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 5000 -> "50,00" (o formato que o campo de preço aceita). */
export function centsToReaisInput(cents: number): string {
  return `${Math.floor(cents / 100)},${pad(cents % 100)}`;
}

/** Evento da API -> valores iniciais do formulário de edição. */
export function toEventFormValues(event: EventResponse): NewEventFormValues {
  return {
    name: event.name,
    description: event.description ?? "",
    location: event.location,
    starts_at: toDateTimeLocal(event.starts_at),
    capacity: event.capacity,
    price:
      event.price_cents === null ? "" : centsToReaisInput(event.price_cents),
    max_tickets_per_cpf: event.max_tickets_per_cpf,
    sales_starts_at: event.sales_starts_at
      ? toDateTimeLocal(event.sales_starts_at)
      : "",
  };
}
