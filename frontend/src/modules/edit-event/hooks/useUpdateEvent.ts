"use client";

import { useCallback, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";
import { editEventService } from "../services/edit-event.service";
import type { UpdateEventRequest, UpdateEventResponse } from "../types/edit-event.dto";

export type UpdateEventResult =
  | { ok: true; event: UpdateEventResponse }
  | { ok: false; status?: number; message: string };

export function useUpdateEvent(eventId: number) {
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (body: UpdateEventRequest): Promise<UpdateEventResult> => {
      setLoading(true);
      try {
        return { ok: true, event: await editEventService.update(eventId, body) };
      } catch (err) {
        const status = getErrorStatus(err);
        const message =
          status === 403
            ? "Só o organizador do evento pode editá-lo."
            : getErrorMessage(err, "Não foi possível salvar o evento.");
        return { ok: false, status, message };
      } finally {
        setLoading(false);
      }
    },
    [eventId],
  );

  return { update, loading };
}
