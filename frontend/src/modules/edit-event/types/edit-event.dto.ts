import type { EventResponse } from "@/shared/types/event";
import type { CreateEventRequest } from "@/modules/new-event/types/new-event.dto";
import { parseReaisToCents } from "@/shared/lib/money";
import type { NewEventFormValues } from "@/modules/new-event/types/new-event.schema";

/**
 * Body de PATCH /events/:id: só os campos enviados mudam. `description: null` apaga a descrição.
 * Capacidade e limite por CPF só podem aumentar (409 se diminuírem).
 */
export type UpdateEventRequest = Partial<
  Omit<CreateEventRequest, "description">
> & {
  description?: string | null;
};

/** Resposta de PATCH /events/:id */
export type UpdateEventResponse = EventResponse;

/** O formulário de edição manda todos os campos (o backend ignora os que não mudaram). */
export function toUpdateEventRequest(
  values: NewEventFormValues,
): UpdateEventRequest {
  return {
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
