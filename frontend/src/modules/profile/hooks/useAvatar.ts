"use client";

import { useCallback, useState } from "react";
import { useImageUpload } from "@/shared/hooks/useImageUpload";
import { getErrorMessage } from "@/shared/lib/api-error";
import type { ImageContentType } from "@/shared/types/image";
import { profileService } from "../services/profile.service";

/**
 * Troca e remoção do avatar. `onChanged` roda depois do sucesso (recarregar perfil e sessão,
 * para o header mostrar a foto nova). Cada ação retorna a mensagem de erro ou null.
 */
export function useAvatar(onChanged?: () => Promise<void> | void) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { upload, uploading, error } = useImageUpload({
    requestUpload: (type: ImageContentType) => profileService.createAvatarUpload(type),
    confirm: (key: string) => profileService.confirmAvatar(key),
  });

  const change = useCallback(
    async (file: File): Promise<string | null> => {
      const result = await upload(file);
      if (!result.ok) return result.error;
      await onChanged?.();
      return null;
    },
    [upload, onChanged],
  );

  const remove = useCallback(async (): Promise<string | null> => {
    setRemoving(true);
    setRemoveError(null);
    try {
      await profileService.removeAvatar();
      await onChanged?.();
      return null;
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível remover a foto.");
      setRemoveError(message);
      return message;
    } finally {
      setRemoving(false);
    }
  }, [onChanged]);

  return { change, remove, uploading, removing, error: error ?? removeError };
}
