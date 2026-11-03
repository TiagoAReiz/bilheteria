import { api } from "@/shared/services/api";
import type { MyTicketResponse } from "../types/my-tickets.dto";

export const myTicketsService = {
  async list(): Promise<MyTicketResponse[]> {
    const { data } = await api.get<MyTicketResponse[]>("/tickets/me");
    return data;
  },
};
