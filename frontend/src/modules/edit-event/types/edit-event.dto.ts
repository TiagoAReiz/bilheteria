import type { EventResponse } from "@/shared/types/event";
import type { CreateEventRequest } from "@/modules/new-event/types/new-event.dto";
import { parseReaisToCents } from "@/shared/lib/money";
import type { NewEventFormValues } from "@/modules/new-event/types/new-event.schema";

/**
 * Body de PATCH /events/:id: só os campos enviados mudam. `description: null` apaga a descrição.
 * Capacidade e limite por CPF só podem aumentar (409 se diminuírem).
 */
export type UpdateEventRequest = Partial<
  Omit<CreateEventRequest, "description" | "sales_starts_at">
> & {
  description?: string | null;
  /** null abre as vendas agora. Só muda enquanto o evento está em breve (409 depois). */
  sales_starts_at?: string | null;
};

/** Resposta de PATCH /events/:id */
export type UpdateEventResponse = EventResponse;

/** O formulário de edição manda todos os campos (o backend ignora os que não mudaram). */
export function toUpdateEventRequest(
  values: NewEventFormValues,
  { salesLocked = false }: { salesLocked?: boolean } = {},
): UpdateEventRequest {
  return {
    // vendas já abertas: o campo nem vai (o backend recusaria qualquer mudança)
    ...(salesLocked
      ? {}
      : {
          sales_starts_at: values.sales_starts_at
            ? new Date(values.sales_starts_at).toISOString()
            : null,
        }),
    name: values.name,
    description: values.description ? values.description : null,
    location: values.location,
    starts_at: new Date(values.starts_at).toISOString(),
    capacity: values.capacity,
    // o schema já garantiu um valor válido
    price_cents: parseReaisToCents(values.price) as number,
    max_tickets_per_cpf: values.max_tickets_per_cpf,
  };
}
