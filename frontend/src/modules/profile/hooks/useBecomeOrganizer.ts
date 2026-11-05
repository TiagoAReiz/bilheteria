"use client";

import { useCallback, useState } from "react";
import { getErrorMessage } from "@/shared/lib/api-error";
import { profileService } from "../services/profile.service";

export function useBecomeOrganizer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Retorna `null` em caso de sucesso ou a mensagem de erro. */
  const becomeOrganizer = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      await profileService.becomeOrganizer();
      return null;
    } catch (err) {
      const message = getErrorMessage(
        err,
        "Não foi possível alterar seu perfil.",
      );
      setError(message);
      return message;
    } finally {
      setLoading(false);
    }
  }, []);

  return { becomeOrganizer, loading, error };
}
