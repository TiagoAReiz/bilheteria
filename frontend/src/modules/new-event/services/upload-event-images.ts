import { eventImagesService } from "@/modules/event-detail/services/event-images.service";
import { getErrorMessage } from "@/shared/lib/api-error";
import {
  uploadToPresignedPost,
  validateImageFile,
} from "@/shared/lib/image-upload";
import type { ImageContentType } from "@/shared/types/image";

export interface PendingEventImages {
  cover: File | null;
  photos: File[];
}

export interface ImageUploadFailure {
  name: string;
  message: string;
}

/**
 * Sobe a capa e as fotos de um evento recém-criado, uma por vez (a galeria fica na ordem
 * escolhida). Uma falha não interrompe as outras: o evento já existe e o que faltou pode ser
 * reenviado na página do evento.
 */
export async function uploadEventImages(
  eventId: number,
  images: PendingEventImages,
): Promise<ImageUploadFailure[]> {
  const failures: ImageUploadFailure[] = [];

  async function send(
    file: File,
    request: (
      type: ImageContentType,
    ) => ReturnType<typeof eventImagesService.createCoverUpload>,
    confirm: (key: string) => Promise<unknown>,
  ) {
    const invalid = validateImageFile(file);
    if (invalid) {
      failures.push({ name: file.name, message: invalid });
      return;
    }
    try {
      const presigned = await request(file.type as ImageContentType);
      await uploadToPresignedPost(presigned, file);
      await confirm(presigned.key);
    } catch (err) {
      failures.push({
        name: file.name,
        message: getErrorMessage(err, "Não foi possível enviar a imagem."),
      });
    }
  }

  if (images.cover) {
    await send(
      images.cover,
      (type) => eventImagesService.createCoverUpload(eventId, type),
      (key) => eventImagesService.confirmCover(eventId, key),
    );
  }
  for (const photo of images.photos) {
    await send(
      photo,
      (type) => eventImagesService.createPhotoUpload(eventId, type),
      (key) => eventImagesService.confirmPhoto(eventId, key),
    );
  }
  return failures;
}
