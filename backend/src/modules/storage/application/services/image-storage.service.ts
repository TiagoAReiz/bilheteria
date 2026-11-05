import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  IMAGE_SIGNATURE_BYTES,
  ImageKind,
  MAX_IMAGE_BYTES,
  PresignedUpload,
  UPLOAD_URL_TTL_SECONDS,
  UploadRejection,
  buildImageKey,
  contentTypeOfKey,
  isImageContentType,
  isImageKeyUnder,
  matchesImageSignature,
} from '../../core/entities/image.js';
import { ImageStorageServicePort } from '../ports/inbound/services/image-storage.service.port.js';
import {
  OBJECT_STORAGE,
  ObjectStorageUnavailableError,
  type ObjectStoragePort,
} from '../ports/outbound/storage/object-storage.port.js';
import {
  STORAGE_METRICS,
  type StorageMetricsPort,
} from '../ports/outbound/metrics/storage-metrics.port.js';

const REJECTION_MESSAGES: Record<UploadRejection, string> = {
  invalid_key: 'Chave de upload inválida',
  missing:
    'O arquivo não foi encontrado no armazenamento. Envie a imagem de novo',
  too_large: `A imagem deve ter no máximo ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
  invalid_type: 'A imagem deve ser JPEG, PNG ou WebP',
  invalid_content: 'O arquivo enviado não é uma imagem válida',
};

const UNAVAILABLE_MESSAGE =
  'O armazenamento de imagens está indisponível. Tente novamente em instantes.';

@Injectable()
export class ImageStorageService implements ImageStorageServicePort {
  private readonly logger = new Logger(ImageStorageService.name);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(STORAGE_METRICS) private readonly metrics: StorageMetricsPort,
  ) {}

  async createUpload(
    kind: ImageKind,
    prefix: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    if (!isImageContentType(contentType)) {
      throw new BadRequestException(REJECTION_MESSAGES.invalid_type);
    }
    const key = buildImageKey(prefix, contentType, randomUUID());
    // a data de expiração é calculada antes de assinar: o front nunca acha que ainda vale quando já venceu
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
    const post = await this.unavailableAs503(() =>
      this.storage.createPresignedPost({
        key,
        contentType,
        maxBytes: MAX_IMAGE_BYTES,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      }),
    );
    this.metrics.uploadUrlIssued(kind);
    return {
      url: post.url,
      fields: post.fields,
      key,
      max_bytes: MAX_IMAGE_BYTES,
      expires_at: expiresAt,
    };
  }

  async confirmUpload(
    kind: ImageKind,
    prefix: string,
    key: string,
  ): Promise<void> {
    if (!isImageKeyUnder(prefix, key)) {
      // não apaga nada: a chave pode ser de outro recurso (ou de outra pessoa)
      this.reject(kind, 'invalid_key');
    }
    const rejection = await this.unavailableAs503(() => this.inspect(key));
    if (rejection) {
      if (rejection !== 'missing') {
        // o S3 já barra tamanho e tipo no POST; chegar aqui é envio por fora do fluxo: não guarda lixo
        await this.deleteQuietly(kind, key);
      }
      this.reject(kind, rejection);
    }
    this.metrics.uploadConfirmed(kind);
  }

  publicUrl(key: string): string {
    return this.storage.publicUrl(key);
  }

  publicUrlOrNull(key: string | null | undefined): string | null {
    return key ? this.storage.publicUrl(key) : null;
  }

  async deleteQuietly(
    kind: ImageKind,
    key: string | null | undefined,
  ): Promise<void> {
    if (!key) {
      return;
    }
    try {
      await this.storage.deleteObject(key);
    } catch (error) {
      // melhor esforço: a referência no banco já mudou; o objeto fica órfão no bucket
      this.metrics.objectDeleteFailed(kind);
      this.logger.warn(
        `Não foi possível apagar a imagem ${key} (${kind}) do armazenamento: ${(error as Error).message}`,
      );
    }
  }

  // null = imagem válida
  private async inspect(key: string): Promise<UploadRejection | null> {
    const object = await this.storage.headObject(key);
    if (!object) {
      return 'missing';
    }
    if (object.size <= 0 || object.size > MAX_IMAGE_BYTES) {
      return 'too_large';
    }
    const expectedType = contentTypeOfKey(key);
    if (!expectedType || object.contentType !== expectedType) {
      return 'invalid_type';
    }
    const head = await this.storage.readPrefix(key, IMAGE_SIGNATURE_BYTES);
    return matchesImageSignature(expectedType, head) ? null : 'invalid_content';
  }

  private reject(kind: ImageKind, reason: UploadRejection): never {
    this.metrics.uploadRejected(kind, reason);
    throw new BadRequestException(REJECTION_MESSAGES[reason]);
  }

  private async unavailableAs503<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ObjectStorageUnavailableError) {
        this.logger.error(
          `Armazenamento de imagens indisponível: ${error.message}`,
        );
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  }
}
