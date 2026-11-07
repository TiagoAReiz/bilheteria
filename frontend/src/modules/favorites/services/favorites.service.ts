import { api } from "@/shared/services/api";
import type { EventResponse } from "@/shared/types/event";

/** Favoritos (wishlist) do usuário logado. */
export const favoritesService = {
  /** GET /favorites: eventos futuros e não cancelados, pela data do evento. */
  async list(): Promise<EventResponse[]> {
    const { data } = await api.get<EventResponse[]>("/favorites");
    return data;
  },

  /** PUT /events/:id/favorite (idempotente). */
  async add(eventId: number): Promise<void> {
    await api.put(`/events/${eventId}/favorite`);
  },

  /** DELETE /events/:id/favorite (idempotente). */
  async remove(eventId: number): Promise<void> {
    await api.delete(`/events/${eventId}/favorite`);
  },
};
