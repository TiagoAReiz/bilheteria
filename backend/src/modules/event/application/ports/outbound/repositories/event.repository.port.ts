import {Event} from "../../../../core/entities/event.entity.js";
import {NewEvent} from "../../../../core/entities/new-event.entity.js";

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

export interface EventRepositoryPort {
    createWithTickets(event: NewEvent): Promise<Event>;
    getUpcomingEvents(): Promise<Event[]>;
    getEventById(id: number): Promise<Event>;
    getEventIdsByOrganizer(organizerId: string): Promise<number[]>;
    /**
     * Recalcula em lote `available_tickets` dos eventos futuros e só grava onde o valor mudou
     * (cada UPDATE vira uma mensagem de CDC para o indice de busca). Retorna quantos eventos mudaram.
     */
    refreshAvailableTickets(reservationTtlMinutes: number): Promise<number>;
}
