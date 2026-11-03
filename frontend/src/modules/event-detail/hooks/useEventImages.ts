"use client";

import { useCallback, useState } from "react";
import { useImageUpload } from "@/shared/hooks/useImageUpload";
import { getErrorMessage } from "@/shared/lib/api-error";
import type { ImageContentType } from "@/shared/types/image";
import { eventImagesService } from "../services/event-images.service";
import type { EventPhoto } from "../types/event-detail.dto";

export interface EventImagesState {
  cover_url: string | null;
  photos: EventPhoto[];
}

/** Troca `photos[index]` com o vizinho (-1 = para a esquerda, 1 = para a direita). */
export function movedOrder(photos: EventPhoto[], photoId: number, direction: -1 | 1): number[] | null {
  const ids = photos.map((photo) => photo.id);
  const index = ids.indexOf(photoId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

/**
 * Capa e galeria do evento na página de detalhe. Começa com o que veio do GET /events/:id e é
 * atualizado com as respostas da API (sem recarregar a página). Retorna mensagem de erro ou null.
 */
export function useEventImages(eventId: number, initial: EventImagesState) {
  const [coverUrl, setCoverUrl] = useState(initial.cover_url);
  const [photos, setPhotos] = useState(initial.photos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cover = useImageUpload({
    requestUpload: (type: ImageContentType) => eventImagesService.createCoverUpload(eventId, type),
    confirm: (key: string) => eventImagesService.confirmCover(eventId, key),
  });
  const photo = useImageUpload({
    requestUpload: (type: ImageContentType) => eventImagesService.createPhotoUpload(eventId, type),
    confirm: (key: string) => eventImagesService.confirmPhoto(eventId, key),
  });

  const uploadCover = useCallback(
    async (file: File): Promise<string | null> => {
      const result = await cover.upload(file);
      if (!result.ok) return result.error;
      setCoverUrl(result.value.cover_url);
      return null;
    },
    [cover],
  );

  const addPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      const result = await photo.upload(file);
      if (!result.ok) return result.error;
      setPhotos(result.value.photos);
      return null;
    },
    [photo],
  );

  // operações sem upload (remover, reordenar): mesmo tratamento de erro/ocupado
  const run = useCallback(async (work: () => Promise<void>, fallback: string): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      await work();
      return null;
    } catch (err) {
      const message = getErrorMessage(err, fallback);
      setError(message);
      return message;
    } finally {
      setBusy(false);
    }
  }, []);

  const removeCover = useCallback(
    () =>
      run(async () => {
        await eventImagesService.removeCover(eventId);
        setCoverUrl(null);
      }, "Não foi possível remover a capa."),
    [eventId, run],
  );

  const removePhoto = useCallback(
    (photoId: number) =>
      run(async () => {
        await eventImagesService.removePhoto(eventId, photoId);
        setPhotos((current) => current.filter((p) => p.id !== photoId));
      }, "Não foi possível remover a foto."),
    [eventId, run],
  );

  const movePhoto = useCallback(
    async (photoId: number, direction: -1 | 1): Promise<string | null> => {
      const order = movedOrder(photos, photoId, direction);
      if (!order) return null;
      return run(async () => {
        const { photos: next } = await eventImagesService.reorderPhotos(eventId, order);
        setPhotos(next);
      }, "Não foi possível reordenar a galeria.");
    },
    [eventId, photos, run],
  );

  return {
    coverUrl,
    photos,
    uploadCover,
    removeCover,
    addPhoto,
    removePhoto,
    movePhoto,
    uploadingCover: cover.uploading,
    uploadingPhoto: photo.uploading,
    busy: busy || cover.uploading || photo.uploading,
    error: error ?? cover.error ?? photo.error,
  };
}
