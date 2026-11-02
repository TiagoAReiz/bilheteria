import { api } from "@/shared/services/api";
import type { CreateEventRequest, CreateEventResponse } from "../types/new-event.dto";

export const newEventService = {
  async create(body: CreateEventRequest): Promise<CreateEventResponse> {
    const { data } = await api.post<CreateEventResponse>("/events", body);
    return data;
  },
};
