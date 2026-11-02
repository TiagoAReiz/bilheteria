import { api } from "@/shared/services/api";
import type { ListEventsResponse } from "../types/event-list.dto";

export const eventsService = {
  async listUpcoming(): Promise<ListEventsResponse> {
    const { data } = await api.get<ListEventsResponse>("/events");
    return data;
  },
};
