import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import {
  ObjectStoragePort,
  ObjectStorageUnavailableError,
  PresignedPost,
  PresignedPostRequest,
  StoredObject,
} from '../../../application/ports/outbound/storage/object-storage.port.js';

export const DEFAULT_STORAGE_BUCKET = 'bilheteria-images';
export const DEFAULT_STORAGE_REGION = 'us-east-1';
// a chave tem um uuid novo a cada envio: o conteúdo de uma URL nunca muda
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface StorageSettings {
  bucket: string;
  region: string;
  /** Vazio = AWS S3 de verdade. LocalStack/MinIO/R2: a URL do serviço. */
  endpoint: string | undefined;
  forcePathStyle: boolean;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  /** Base das URLs servidas ao front (bucket público, CloudFront, domínio do R2...). */
  publicUrl: string;
}

const trimSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * STORAGE_* do .env. Nada é obrigatório: sem configuração a API sobe (o S3Client não conecta no
 * construtor) e só as rotas de imagem falham. Trocar de provedor é só mudar estas variáveis.
 */
export function readStorageSettings(config: ConfigService): StorageSettings {
  const get = (name: string) => config.get<string>(name)?.trim() || undefined;
  const bucket = get('STORAGE_S3_BUCKET') ?? DEFAULT_STORAGE_BUCKET;
  const region = get('STORAGE_S3_REGION') ?? DEFAULT_STORAGE_REGION;
  const endpoint = get('STORAGE_S3_ENDPOINT');
  const forcePathStyle = get('STORAGE_S3_FORCE_PATH_STYLE') === 'true';
  const derivedPublicUrl = endpoint
    ? forcePathStyle
      ? `${trimSlash(endpoint)}/${bucket}`
      : endpoint.replace('://', `://${bucket}.`)
    : `https://${bucket}.s3.${region}.amazonaws.com`;
  return {
    bucket,
    region,
    endpoint,
    forcePathStyle,
    accessKeyId: get('STORAGE_S3_ACCESS_KEY_ID'),
    secretAccessKey: get('STORAGE_S3_SECRET_ACCESS_KEY'),
    publicUrl: trimSlash(get('STORAGE_PUBLIC_URL') ?? derivedPublicUrl),
  };
}

export function createS3Client(settings: StorageSettings): S3Client {
  return new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: settings.forcePathStyle,
    // sem chaves no .env: cadeia padrão da AWS (variáveis AWS_*, perfil, role da máquina)
    credentials:
      settings.accessKeyId && settings.secretAccessKey
        ? {
            accessKeyId: settings.accessKeyId,
            secretAccessKey: settings.secretAccessKey,
          }
        : undefined,
    requestHandler: { connectionTimeout: 2_000, requestTimeout: 5_000 },
  });
}

function statusOf(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
}

function isNotFound(error: unknown): boolean {
  return (
    statusOf(error) === 404 ||
    (error instanceof S3ServiceException &&
      (error.name === 'NotFound' || error.name === 'NoSuchKey'))
  );
}

// rede, timeout, 5xx e throttling: o bucket está fora, não é bug nosso
function isUnavailable(error: unknown): boolean {
  const status = statusOf(error);
  return status === undefined || status >= 500 || status === 429;
}

/** S3 (ou compatível) com o AWS SDK v3. Todo detalhe do SDK fica aqui. */
@Injectable()
export class S3ObjectStorage implements ObjectStoragePort, OnModuleDestroy {
  private readonly settings: StorageSettings;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.settings = readStorageSettings(config);
    this.client = createS3Client(this.settings);
  }

  async createPresignedPost(
    request: PresignedPostRequest,
  ): Promise<PresignedPost> {
    // assinar é local (só usa as credenciais), não fala com o bucket
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.settings.bucket,
      Key: request.key,
      // os Fields viram condições exatas da política: o S3 recusa outro Content-Type
      Fields: {
        'Content-Type': request.contentType,
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      },
      Conditions: [['content-length-range', 1, request.maxBytes]],
      Expires: request.expiresInSeconds,
    });
    return { url, fields };
  }

  async headObject(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }),
      );
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw this.translate(error, 'consultar o objeto');
    }
  }

  async readPrefix(key: string, length: number): Promise<Uint8Array> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Range: `bytes=0-${length - 1}`,
        }),
      );
      return object.Body
        ? await object.Body.transformToByteArray()
        : new Uint8Array();
    } catch (error) {
      if (isNotFound(error)) {
        return new Uint8Array();
      }
      throw this.translate(error, 'ler o objeto');
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      // o S3 responde 204 também para chave inexistente
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }),
      );
    } catch (error) {
      throw this.translate(error, 'apagar o objeto');
    }
  }

  publicUrl(key: string): string {
    return `${this.settings.publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  onModuleDestroy() {
    this.client.destroy();
  }

  private translate(error: unknown, action: string): Error {
    if (isUnavailable(error)) {
      return new ObjectStorageUnavailableError(
        `Armazenamento indisponível ao ${action}`,
        { cause: error },
      );
    }
    // 403 (credencial/política), 400... é configuração errada: vira 500 e aparece no log
    return error instanceof Error ? error : new Error(String(error));
  }
}
