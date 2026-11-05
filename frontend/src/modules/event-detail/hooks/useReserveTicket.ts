"use client";

import { useCallback, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";
import { eventDetailService } from "../services/event-detail.service";
import {
  RESERVATION_TTL_MINUTES,
  type TicketResponse,
} from "../types/event-detail.dto";

export type ReserveErrorKind =
  "cpf_required" | "conflict" | "not_found" | "unknown";

export interface ReserveError {
  kind: ReserveErrorKind;
  message: string;
}

export interface ReserveResult {
  ticket: TicketResponse;
  expiresAt: Date;
}

function classify(status: number | undefined): ReserveErrorKind {
  if (status === 403) return "cpf_required";
  if (status === 409) return "conflict";
  if (status === 404) return "not_found";
  return "unknown";
}

export function getReservationExpiry(
  reservedAt: string | null,
  now = new Date(),
): Date {
  const base = reservedAt ? new Date(reservedAt) : now;
  return new Date(base.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);
}

export function isReserveError(
  value: ReserveResult | ReserveError,
): value is ReserveError {
  return "kind" in value;
}

export function useReserveTicket(eventId: number) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReserveResult | null>(null);
  const [error, setError] = useState<ReserveError | null>(null);

  const reserve = useCallback(async (): Promise<
    ReserveResult | ReserveError
  > => {
    setLoading(true);
    setError(null);
    try {
      const ticket = await eventDetailService.reserveTicket(eventId);
      const next: ReserveResult = {
        ticket,
        expiresAt: getReservationExpiry(ticket.reserved_at),
      };
      setResult(next);
      return next;
    } catch (err) {
      const status = getErrorStatus(err);
      const next: ReserveError = {
        kind: classify(status),
        message:
          status === 403
            ? getErrorMessage(
                err,
                "Cadastre seu CPF antes de reservar ingressos.",
              )
            : getErrorMessage(err, "Não foi possível reservar o ingresso."),
      };
      setError(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  return { reserve, loading, result, error };
}
