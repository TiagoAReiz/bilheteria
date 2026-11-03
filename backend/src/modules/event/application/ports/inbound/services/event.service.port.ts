import {Event} from "../../../../core/entities/event.entity.js";
import {NewEvent} from "../../../../core/entities/new-event.entity.js";

export const EVENT_SERVICE = Symbol('EVENT_SERVICE');

export interface EventServicePort {
    createEvent(event: NewEvent): Promise<Event>;
    listUpcomingEvents(): Promise<Event[]>;
    getEventById(id: number): Promise<Event>;
    getEventIdsByOrganizer(organizerId: string): Promise<number[]>;
}
