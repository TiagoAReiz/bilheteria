export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignedPostRequest {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresInSeconds: number;
}

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface StoredObject {
  size: number;
  contentType: string | null;
}

/** O bucket não respondeu (rede, timeout, 5xx): a operação pode ser repetida depois. */
export class ObjectStorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ObjectStorageUnavailableError';
  }
}

/**
 * Armazenamento de objetos (S3 ou compatível: LocalStack, R2, MinIO). Não conhece regra de
 * imagem nem quem pode enviar: só fala com o bucket.
 */
export interface ObjectStoragePort {
  /** POST pré-assinado que só aceita `key`, `contentType` e no máximo `maxBytes`. */
  createPresignedPost(request: PresignedPostRequest): Promise<PresignedPost>;
  /** Metadados do objeto, ou null se não existir. */
  headObject(key: string): Promise<StoredObject | null>;
  /** Os primeiros `length` bytes do objeto (para conferir a assinatura do arquivo). */
  readPrefix(key: string, length: number): Promise<Uint8Array>;
  /** Remove o objeto (não falha se ele já não existir). */
  deleteObject(key: string): Promise<void>;
  /** URL pública de leitura (STORAGE_PUBLIC_URL + chave). */
  publicUrl(key: string): string;
}
