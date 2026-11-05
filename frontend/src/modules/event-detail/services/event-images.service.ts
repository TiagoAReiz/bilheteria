import { api } from "@/shared/services/api";
import type {
  ConfirmImageUploadRequest,
  CreateImageUploadRequest,
  ImageContentType,
  PresignedUpload,
} from "@/shared/types/image";
import type {
  ConfirmCoverResponse,
  GalleryResponse,
  ReorderPhotosRequest,
} from "../types/event-detail.dto";

/** Capa e galeria do evento (só o organizador dono ou ADMIN; a API responde 403 para os demais). */
export const eventImagesService = {
  async createCoverUpload(
    eventId: number,
    contentType: ImageContentType,
  ): Promise<PresignedUpload> {
    const body: CreateImageUploadRequest = { content_type: contentType };
    const { data } = await api.post<PresignedUpload>(
      `/events/${eventId}/cover/upload-url`,
      body,
    );
    return data;
  },

  async confirmCover(
    eventId: number,
    key: string,
  ): Promise<ConfirmCoverResponse> {
    const body: ConfirmImageUploadRequest = { key };
    const { data } = await api.put<ConfirmCoverResponse>(
      `/events/${eventId}/cover`,
      body,
    );
    return data;
  },

  async removeCover(eventId: number): Promise<void> {
    await api.delete(`/events/${eventId}/cover`);
  },

  async createPhotoUpload(
    eventId: number,
    contentType: ImageContentType,
  ): Promise<PresignedUpload> {
    const body: CreateImageUploadRequest = { content_type: contentType };
    const { data } = await api.post<PresignedUpload>(
      `/events/${eventId}/photos/upload-url`,
      body,
    );
    return data;
  },

  async confirmPhoto(eventId: number, key: string): Promise<GalleryResponse> {
    const body: ConfirmImageUploadRequest = { key };
    const { data } = await api.post<GalleryResponse>(
      `/events/${eventId}/photos`,
      body,
    );
    return data;
  },

  async removePhoto(eventId: number, photoId: number): Promise<void> {
    await api.delete(`/events/${eventId}/photos/${photoId}`);
  },

  async reorderPhotos(
    eventId: number,
    photoIds: number[],
  ): Promise<GalleryResponse> {
    const body: ReorderPhotosRequest = { photo_ids: photoIds };
    const { data } = await api.patch<GalleryResponse>(
      `/events/${eventId}/photos/order`,
      body,
    );
    return data;
  },
};
