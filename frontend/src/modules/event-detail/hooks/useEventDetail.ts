"use client";

import { useAsync } from "@/shared/hooks/useAsync";
import { eventDetailService } from "../services/event-detail.service";

export function useEventDetail(eventId: number) {
  const event = useAsync(() => eventDetailService.getEvent(eventId), eventId);
  const status = useAsync(() => eventDetailService.getTicketStatus(eventId), eventId);

  return {
    event: event.data,
    loading: event.loading,
    error: event.error,
    notFound: event.status === 404,
    ticketStatus: status.data,
    ticketStatusLoading: status.loading,
    ticketStatusError: status.error,
    reloadTicketStatus: status.reload,
  };
}
