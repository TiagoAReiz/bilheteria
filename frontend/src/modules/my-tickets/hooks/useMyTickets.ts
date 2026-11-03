"use client";

import { useAsync } from "@/shared/hooks/useAsync";
import { myTicketsService } from "../services/my-tickets.service";

export function useMyTickets() {
  const tickets = useAsync(() => myTicketsService.list());
  return {
    tickets: tickets.data ?? [],
    loading: tickets.loading,
    error: tickets.error,
    reload: tickets.reload,
  };
}
