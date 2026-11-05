/** Tipos aceitos pela API (o S3 recusa qualquer outro Content-Type no POST pré-assinado). */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageContentType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Tamanho máximo do arquivo (o S3 também barra pelo content-length-range). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Resposta dos POST .../upload-url: tudo o que o navegador precisa para enviar direto ao bucket. */
export interface PresignedUpload {
  /** URL do bucket para o POST multipart. */
  url: string;
  /** Campos do formulário, enviados antes do arquivo. */
  fields: Record<string, string>;
  /** Chave gerada pelo servidor; volta na confirmação. */
  key: string;
  max_bytes: number;
  expires_at: string;
}

/** Body dos POST .../upload-url */
export interface CreateImageUploadRequest {
  content_type: ImageContentType;
}

/** Body da confirmação (PUT capa/avatar, POST foto). */
export interface ConfirmImageUploadRequest {
  key: string;
}
