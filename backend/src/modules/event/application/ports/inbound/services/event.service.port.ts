import {Event} from "../../../../core/entities/event.entity.js";
import {NewEvent} from "../../../../core/entities/new-event.entity.js";
import {EventDetailView, EventView} from "../../../../core/entities/event-image.entity.js";
import {EventChanges, EventEditor} from "../../../../core/entities/event-update.js";

export const EVENT_SERVICE = Symbol('EVENT_SERVICE');

export interface EventServicePort {
    createEvent(event: NewEvent): Promise<EventView>;
    listUpcomingEvents(): Promise<EventView[]>;
    /** Para outros módulos (reserva, status): o evento cru, sem montar URLs nem buscar a galeria. */
    getEventById(id: number): Promise<Event>;
    /** GET /events/:id: com `cover_url` e a galeria em ordem. */
    getEventDetail(id: number): Promise<EventDetailView>;
    getEventIdsByOrganizer(organizerId: string): Promise<number[]>;
    /** PATCH /events/:id: só o dono ou ADMIN; capacidade e limite por CPF só aumentam. */
    updateEvent(id: number, editor: EventEditor, changes: EventChanges): Promise<EventView>;
}
