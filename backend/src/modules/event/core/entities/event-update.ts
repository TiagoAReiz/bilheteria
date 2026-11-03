import {Event} from "./event.entity.js";
import {Role} from "../../../users/core/entities/role.js";

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
    | 'limit_above_capacity';

export type EventUpdateResult =
    | {outcome: 'updated'; event: Event}
    | {outcome: 'rejected'; reason: EventUpdateRejection};

/**
 * Regras da edição, checadas com a linha do evento travada (o valor atual não muda no meio):
 * - só o organizador dono ou um ADMIN;
 * - evento que já começou não muda mais;
 * - capacidade só aumenta (diminuir apagaria ingressos que podem estar reservados ou pagos);
 * - limite por CPF só aumenta (a escolha do organizador é irreversível: quem comprou contando
 *   com o limite nunca fica acima dele) e continua no máximo igual à capacidade.
 */
export function checkEventUpdate(
    current: Event,
    changes: EventChanges,
    editor: EventEditor,
    now: Date,
): EventUpdateRejection | null {
    if (editor.role !== Role.ADMIN && current.organizer_id !== editor.id) return 'forbidden';
    if (current.starts_at.getTime() <= now.getTime()) return 'event_started';
    if (changes.capacity !== undefined && changes.capacity < current.capacity) return 'capacity_decrease';
    if (changes.max_tickets_per_cpf !== undefined && changes.max_tickets_per_cpf < current.max_tickets_per_cpf) {
        return 'limit_decrease';
    }
    const capacity = changes.capacity ?? current.capacity;
    const limit = changes.max_tickets_per_cpf ?? current.max_tickets_per_cpf;
    if (limit > capacity) return 'limit_above_capacity';
    return null;
}
