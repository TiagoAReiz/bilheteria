import { z } from "zod";
import { formatBRL, parseReaisToCents } from "@/shared/lib/money";
import type { CreateEventRequest } from "./new-event.dto";

export const MAX_CAPACITY = 100000;
/** Mesmos limites do backend (centavos): R$ 1,00 a R$ 100.000,00. */
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 10_000_000;

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
  /** Em reais, como a pessoa digita (ex.: "50,00"); vira centavos no envio. */
  price: z
    .string()
    .trim()
    // uma mensagem por vez: a primeira regra que falhar
    .superRefine((value, ctx) => {
      const message = priceError(value);
      if (message) ctx.addIssue({ code: "custom", message });
    }),
});

function priceError(value: string): string | undefined {
  if (!value) return "Informe o preço do ingresso";
  const cents = parseReaisToCents(value);
  if (cents === null) return "Preço inválido. Use, por exemplo, 50,00";
  if (cents < MIN_PRICE_CENTS) return `O preço mínimo é ${formatBRL(MIN_PRICE_CENTS)}`;
  if (cents > MAX_PRICE_CENTS) return `O preço máximo é ${formatBRL(MAX_PRICE_CENTS)}`;
  return undefined;
}

export type NewEventFormValues = z.infer<typeof newEventSchema>;

/** Converte os valores do formulário (datetime-local no fuso do navegador) no body da API. */
export function toCreateEventRequest(values: NewEventFormValues): CreateEventRequest {
  return {
    name: values.name,
    description: values.description ? values.description : undefined,
    location: values.location,
    starts_at: new Date(values.starts_at).toISOString(),
    capacity: values.capacity,
    // o schema já garantiu um valor válido
    price_cents: parseReaisToCents(values.price) as number,
  };
}
