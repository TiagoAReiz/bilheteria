import { api } from "@/shared/services/api";
import type { EventResponse } from "@/shared/types/event";
import type { UpdateEventRequest, UpdateEventResponse } from "../types/edit-event.dto";

export const editEventService = {
  async getEvent(id: number): Promise<EventResponse> {
    const { data } = await api.get<EventResponse>(`/events/${id}`);
    return data;
  },

  async update(id: number, body: UpdateEventRequest): Promise<UpdateEventResponse> {
    const { data } = await api.patch<UpdateEventResponse>(`/events/${id}`, body);
    return data;
  },
};
