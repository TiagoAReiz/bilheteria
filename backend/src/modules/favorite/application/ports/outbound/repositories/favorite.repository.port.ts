import { Event } from '../../../../../event/core/entities/event.entity.js';

export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

export interface FavoriteRepositoryPort {
  /**
   * Favorita o evento (repetir não duplica). event_not_found se o evento não existe, foi
   * cancelado ou já começou (`now`).
   */
  add(
    userId: string,
    eventId: number,
    now: Date,
  ): Promise<'added' | 'event_not_found'>;
  /** Desfavorita; não falha se não estava favoritado. */
  remove(userId: string, eventId: number): Promise<void>;
  /** Eventos favoritados que ainda não começaram e não foram cancelados, pela data do evento. */
  listEvents(userId: string, now: Date): Promise<Event[]>;
}
