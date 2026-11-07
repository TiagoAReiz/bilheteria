import { EventView } from '../../../../../event/core/entities/event-image.entity.js';

export const FAVORITE_SERVICE = Symbol('FAVORITE_SERVICE');

export interface FavoriteServicePort {
  /** NotFound se o evento não existe, foi cancelado ou já começou. */
  favorite(userId: string, eventId: number): Promise<void>;
  unfavorite(userId: string, eventId: number): Promise<void>;
  /** GET /favorites: futuros e não cancelados, com `cover_url` e `sales_starts_at`. */
  listFavorites(userId: string): Promise<EventView[]>;
}
