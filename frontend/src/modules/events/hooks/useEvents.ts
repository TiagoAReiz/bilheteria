"use client";

import { useAsync } from "@/shared/hooks/useAsync";
import { eventsService } from "../services/events.service";

export function useEvents() {
  const { data, loading, error, reload } = useAsync(() => eventsService.listUpcoming());
  return { events: data ?? [], loading, error, reload };
}
