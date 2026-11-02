import {Event} from "../../../../core/entities/event.entity.js";
import {NewEvent} from "../../../../core/entities/new-event.entity.js";

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

export interface EventRepositoryPort {
    createWithTickets(event: NewEvent): Promise<Event>;
    getUpcomingEvents(): Promise<Event[]>;
    getEventById(id: number): Promise<Event>;
}
