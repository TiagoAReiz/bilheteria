import {Event} from "./event.entity.js";
import {Role} from "../../../users/core/entities/role.js";

/** Tamanho máximo da galeria de um evento (a capa não conta). */
export const MAX_EVENT_PHOTOS = 10;

export class EventPhoto {
    id: number;
    event_id: number;
    key: string;
    position: number;
    created_at: Date;
}

export interface EventPhotoView {
    id: number;
    url: string;
    position: number;
}

/** Evento como sai na API: a chave da capa vira URL pública. */
export type EventView = Omit<Event, 'cover_key'> & {cover_url: string | null};

/** GET /events/:id: o evento com a galeria em ordem. */
export type EventDetailView = EventView & {photos: EventPhotoView[]};

export interface EventWithPhotos extends Event {
    photos: EventPhoto[];
}

/** Quem está tentando mexer nas imagens (usuário da sessão). */
export interface ImageEditor {
    id: string;
    role: string;
}

/** Só o organizador que criou o evento ou um ADMIN mexem na capa e na galeria. */
export function canEditEventImages(event: Pick<Event, 'organizer_id'>, editor: ImageEditor): boolean {
    return editor.role === Role.ADMIN || event.organizer_id === editor.id;
}

export function toEventView(event: Event, publicUrl: (key: string) => string): EventView {
    const {cover_key, ...rest} = event;
    return {...rest, cover_url: cover_key ? publicUrl(cover_key) : null};
}

export function toPhotoViews(photos: EventPhoto[], publicUrl: (key: string) => string): EventPhotoView[] {
    return [...photos]
        .sort((a, b) => a.position - b.position)
        .map((photo) => ({id: photo.id, url: publicUrl(photo.key), position: photo.position}));
}

/** A nova ordem é exatamente uma permutação das fotos atuais? */
export function isPermutationOf(current: number[], requested: number[]): boolean {
    if (current.length !== requested.length || new Set(requested).size !== requested.length) {
        return false;
    }
    const ids = new Set(current);
    return requested.every((id) => ids.has(id));
}
