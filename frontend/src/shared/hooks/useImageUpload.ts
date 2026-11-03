"use client";

import { useCallback, useState } from "react";
import { getErrorMessage } from "@/shared/lib/api-error";
import { uploadToPresignedPost, validateImageFile } from "@/shared/lib/image-upload";
import type { ImageContentType, PresignedUpload } from "@/shared/types/image";

export interface ImageUploadSteps<T> {
  /** Pede à API o POST pré-assinado (POST .../upload-url). */
  requestUpload: (contentType: ImageContentType) => Promise<PresignedUpload>;
  /** Confirma na API depois do envio ao bucket (PUT/POST com a `key`). */
  confirm: (key: string) => Promise<T>;
}

export type ImageUploadResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Upload em três passos: checa tipo/tamanho no navegador, envia direto ao bucket com a URL
 * pré-assinada pela API e confirma na API (que confere o arquivo no bucket antes de gravar).
 */
export function useImageUpload<T>(steps: ImageUploadSteps<T>) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requestUpload, confirm } = steps;

  const upload = useCallback(
    async (file: File): Promise<ImageUploadResult<T>> => {
      const invalid = validateImageFile(file);
      if (invalid) {
        setError(invalid);
        return { ok: false, error: invalid };
      }
      setUploading(true);
      setError(null);
      try {
        const presigned = await requestUpload(file.type as ImageContentType);
        await uploadToPresignedPost(presigned, file);
        return { ok: true, value: await confirm(presigned.key) };
      } catch (err) {
        const message = getErrorMessage(err, "Não foi possível enviar a imagem.");
        setError(message);
        return { ok: false, error: message };
      } finally {
        setUploading(false);
      }
    },
    [requestUpload, confirm],
  );

  const reset = useCallback(() => setError(null), []);

  return { upload, uploading, error, reset };
}
