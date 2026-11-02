"use client";

import { useCallback, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";
import { newEventService } from "../services/new-event.service";
import type { CreateEventRequest, CreateEventResponse } from "../types/new-event.dto";

export type CreateEventResult =
  | { ok: true; event: CreateEventResponse }
  | { ok: false; status?: number; message: string };

export function useCreateEvent() {
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (body: CreateEventRequest): Promise<CreateEventResult> => {
    setLoading(true);
    try {
      const event = await newEventService.create(body);
      return { ok: true, event };
    } catch (err) {
      const status = getErrorStatus(err);
      const message =
        status === 403
          ? "Apenas organizadores podem criar eventos."
          : getErrorMessage(err, "Não foi possível criar o evento.");
      return { ok: false, status, message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading };
}
