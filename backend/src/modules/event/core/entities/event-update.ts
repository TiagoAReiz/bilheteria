import { Event } from './event.entity.js';
import { Role } from '../../../users/core/entities/role.js';
import { isComingSoon } from './event-sales.js';

/** Campos que o organizador pode mudar num evento (PATCH /events/:id); ausente = não muda. */
export interface EventChanges {
  name?: string;
  /** null apaga a descrição */
  description?: string | null;
  location?: string;
  starts_at?: Date;
  capacity?: number;
  price_cents?: number;
  max_tickets_per_cpf?: number;
  /** null abre as vendas agora */
  sales_starts_at?: Date | null;
}

/** Quem está editando (usuário da sessão). */
export interface EventEditor {
  id: string;
  role: string;
}

export type EventUpdateRejection =
  | 'forbidden'
  | 'event_started'
  | 'capacity_decrease'
  | 'limit_decrease'
  | 'limit_above_capacity'
  | 'sales_already_open'
  | 'sales_after_start';

export type EventUpdateResult =
  | { outcome: 'updated'; event: Event }
  | { outcome: 'rejected'; reason: EventUpdateRejection };

/**
 * Regras da edição, checadas com a linha do evento travada (o valor atual não muda no meio):
 * - só o organizador dono ou um ADMIN;
 * - evento que já começou não muda mais;
 * - capacidade só aumenta (diminuir apagaria ingressos que podem estar reservados ou pagos);
 * - limite por CPF só aumenta (a escolha do organizador é irreversível: quem comprou contando
 *   com o limite nunca fica acima dele) e continua no máximo igual à capacidade;
 * - o início das vendas só muda enquanto o evento está em breve (aberto, já pode ter venda) e
 *   fica sempre antes do início do evento (o novo ou o atual).
 */
export function checkEventUpdate(
  current: Event,
  changes: EventChanges,
  editor: EventEditor,
  now: Date,
): EventUpdateRejection | null {
  if (editor.role !== Role.ADMIN && current.organizer_id !== editor.id)
    return 'forbidden';
  if (current.starts_at.getTime() <= now.getTime()) return 'event_started';
  if (changes.capacity !== undefined && changes.capacity < current.capacity)
    return 'capacity_decrease';
  if (
    changes.max_tickets_per_cpf !== undefined &&
    changes.max_tickets_per_cpf < current.max_tickets_per_cpf
  ) {
    return 'limit_decrease';
  }
  const capacity = changes.capacity ?? current.capacity;
  const limit = changes.max_tickets_per_cpf ?? current.max_tickets_per_cpf;
  if (limit > capacity) return 'limit_above_capacity';
  if (
    changes.sales_starts_at !== undefined &&
    timeOf(changes.sales_starts_at) !== timeOf(current.sales_starts_at) &&
    !isComingSoon(current, now)
  ) {
    return 'sales_already_open';
  }
  const salesStartsAt =
    changes.sales_starts_at !== undefined
      ? changes.sales_starts_at
      : current.sales_starts_at;
  const startsAt = changes.starts_at ?? current.starts_at;
  if (salesStartsAt && salesStartsAt.getTime() >= startsAt.getTime()) {
    return 'sales_after_start';
  }
  return null;
}

function timeOf(date: Date | null): number | null {
  return date ? date.getTime() : null;
}
