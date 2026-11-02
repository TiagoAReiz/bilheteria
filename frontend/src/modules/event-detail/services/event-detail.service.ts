import { api } from "@/shared/services/api";
import type {
  EventDetailResponse,
  ReserveTicketRequest,
  TicketResponse,
  TicketStatusResponse,
} from "../types/event-detail.dto";

export const eventDetailService = {
  async getEvent(id: number): Promise<EventDetailResponse> {
    const { data } = await api.get<EventDetailResponse>(`/events/${id}`);
    return data;
  },

  async getTicketStatus(eventId: number): Promise<TicketStatusResponse> {
    const { data } = await api.get<TicketStatusResponse>(`/status/${eventId}`);
    return data;
  },

  async reserveTicket(eventId: number): Promise<TicketResponse> {
    const body: ReserveTicketRequest = { event_id: eventId };
    const { data } = await api.post<TicketResponse>("/reservation", body);
    return data;
  },
};
