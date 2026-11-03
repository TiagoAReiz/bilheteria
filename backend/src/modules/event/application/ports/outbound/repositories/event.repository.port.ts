import {Event} from "../../../../core/entities/event.entity.js";
import {NewEvent} from "../../../../core/entities/new-event.entity.js";
import {EventWithPhotos} from "../../../../core/entities/event-image.entity.js";
import {EventChanges, EventUpdateRejection, EventUpdateResult} from "../../../../core/entities/event-update.js";

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

export interface EventRepositoryPort {
    createWithTickets(event: NewEvent): Promise<Event>;
    getUpcomingEvents(): Promise<Event[]>;
    getEventById(id: number): Promise<Event>;
    /** O evento com a galeria ordenada por `position`; NotFound se não existe ou foi excluído. */
    getEventWithPhotos(id: number): Promise<EventWithPhotos>;
    getEventIdsByOrganizer(organizerId: string): Promise<number[]>;
    /**
     * Aplica `changes` com a linha do evento travada: `check` recebe o valor atual e pode recusar.
     * Aumento de capacidade cria os ingressos novos (livres) na mesma transação.
     * NotFound se o evento não existe ou foi excluído.
     */
    updateWithTickets(
        id: number,
        changes: EventChanges,
        check: (current: Event) => EventUpdateRejection | null,
    ): Promise<EventUpdateResult>;
    /**
     * Recalcula em lote `available_tickets` dos eventos futuros e só grava onde o valor mudou
     * (cada UPDATE vira uma mensagem de CDC para o indice de busca). Retorna quantos eventos mudaram.
     */
    refreshAvailableTickets(reservationTtlMinutes: number): Promise<number>;
}
