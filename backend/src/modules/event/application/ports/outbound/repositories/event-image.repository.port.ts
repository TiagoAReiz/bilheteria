import {EventPhoto} from "../../../../core/entities/event-image.entity.js";

export const EVENT_IMAGE_REPOSITORY = Symbol('EVENT_IMAGE_REPOSITORY');

export type AddPhotoResult =
    | {outcome: 'added'; photos: EventPhoto[]}
    | {outcome: 'limit_reached'}
    | {outcome: 'event_not_found'};

export type ReorderPhotosResult =
    | {outcome: 'reordered'; photos: EventPhoto[]}
    | {outcome: 'mismatch'}
    | {outcome: 'event_not_found'};

/**
 * Capa e galeria. Toda escrita trava a linha do evento (SELECT ... FOR UPDATE), então duas
 * confirmações simultâneas não passam do limite nem disputam a mesma posição.
 */
export interface EventImageRepositoryPort {
    /** Dono do evento não excluído, ou null. */
    getOrganizerId(eventId: number): Promise<string | null>;
    countPhotos(eventId: number): Promise<number>;
    /** Troca (ou remove, com null) a capa e devolve a chave anterior; null se o evento não existe. */
    replaceCover(eventId: number, key: string | null): Promise<{previousKey: string | null} | null>;
    /** Adiciona no fim da galeria se houver espaço; a mesma chave confirmada de novo não duplica. */
    addPhoto(eventId: number, key: string, maxPhotos: number): Promise<AddPhotoResult>;
    /** Remove e devolve a foto removida (para apagar o objeto), ou null se não for deste evento. */
    removePhoto(eventId: number, photoId: number): Promise<EventPhoto | null>;
    /** `photoIds` precisa ser exatamente as fotos atuais, na nova ordem. */
    reorderPhotos(eventId: number, photoIds: number[]): Promise<ReorderPhotosResult>;
}
