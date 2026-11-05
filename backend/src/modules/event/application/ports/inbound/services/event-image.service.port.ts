import {
  EventPhotoView,
  ImageEditor,
} from '../../../../core/entities/event-image.entity.js';
import { PresignedUpload } from '../../../../../storage/core/entities/image.js';

export const EVENT_IMAGE_SERVICE = Symbol('EVENT_IMAGE_SERVICE');

/**
 * Capa e galeria do evento. Só o organizador dono do evento ou um ADMIN (403 para os demais;
 * 404 se o evento não existe ou foi excluído). O upload é direto do navegador para o bucket:
 * `create*Upload` devolve o POST pré-assinado e `confirm*` grava a referência depois de conferir
 * o objeto no bucket.
 */
export interface EventImageServicePort {
  createCoverUpload(
    eventId: number,
    editor: ImageEditor,
    contentType: string,
  ): Promise<PresignedUpload>;
  /** Troca a capa e apaga a anterior do bucket (melhor esforço). */
  confirmCover(
    eventId: number,
    editor: ImageEditor,
    key: string,
  ): Promise<{ cover_url: string }>;
  removeCover(eventId: number, editor: ImageEditor): Promise<void>;

  /** 409 se a galeria já está cheia (checagem antecipada; a garantia é na confirmação). */
  createPhotoUpload(
    eventId: number,
    editor: ImageEditor,
    contentType: string,
  ): Promise<PresignedUpload>;
  /** Adiciona no fim da galeria; 409 se já houver 10 fotos (o objeto enviado é apagado). */
  confirmPhoto(
    eventId: number,
    editor: ImageEditor,
    key: string,
  ): Promise<{ photos: EventPhotoView[] }>;
  removePhoto(
    eventId: number,
    editor: ImageEditor,
    photoId: number,
  ): Promise<void>;
  /** `photoIds` deve conter exatamente as fotos atuais (400 se não). */
  reorderPhotos(
    eventId: number,
    editor: ImageEditor,
    photoIds: number[],
  ): Promise<{ photos: EventPhotoView[] }>;
}
