// Regras das imagens enviadas pelos usuários (capa/galeria de evento e avatar).
// Funções puras: sem S3, sem Nest. O bucket guarda o arquivo ORIGINAL (sem redimensionar).

/** Tipos aceitos e a extensão usada na chave do objeto. */
export const IMAGE_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type ImageContentType = keyof typeof IMAGE_CONTENT_TYPES;

/** Tamanho máximo do arquivo, garantido pelo próprio S3 (content-length-range do POST pré-assinado). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Validade do POST pré-assinado. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

/** Quantos bytes do início do arquivo bastam para conferir a assinatura (magic number). */
export const IMAGE_SIGNATURE_BYTES = 12;

/** Para que serve a imagem: vira label de métrica (valores fixos, nunca ids). */
export type ImageKind = 'event_cover' | 'event_photo' | 'user_avatar';

/** Por que uma confirmação de upload foi recusada. */
export type UploadRejection =
  | 'invalid_key' // chave fora do prefixo esperado (forjada ou de outro recurso)
  | 'missing' // nada foi enviado com essa chave (ou o envio falhou)
  | 'too_large'
  | 'invalid_type' // Content-Type gravado não é um dos aceitos ou não bate com a extensão
  | 'invalid_content'; // os bytes não são do formato declarado

/** O que o navegador precisa para enviar o arquivo direto ao bucket (multipart/form-data). */
export interface PresignedUpload {
  /** URL do POST (o bucket). */
  url: string;
  /** Campos do formulário, enviados ANTES do arquivo (o arquivo vai por último, no campo `file`). */
  fields: Record<string, string>;
  /** Chave gerada pelo servidor; volta no passo de confirmação. */
  key: string;
  max_bytes: number;
  expires_at: Date;
}

export function isImageContentType(value: unknown): value is ImageContentType {
  return typeof value === 'string' && Object.hasOwn(IMAGE_CONTENT_TYPES, value);
}

/** Chave do objeto: `<prefixo>/<uuid>.<ext>`. Nunca usa o nome do arquivo do cliente. */
export function buildImageKey(
  prefix: string,
  contentType: ImageContentType,
  id: string,
): string {
  return `${prefix}/${id}.${IMAGE_CONTENT_TYPES[contentType]}`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const EXTENSIONS = Object.values(IMAGE_CONTENT_TYPES).join('|');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A chave foi gerada por `buildImageKey` com este prefixo? (barra chaves forjadas pelo cliente) */
export function isImageKeyUnder(prefix: string, key: unknown): key is string {
  return (
    typeof key === 'string' &&
    new RegExp(`^${escapeRegExp(prefix)}/${UUID}\\.(${EXTENSIONS})$`).test(key)
  );
}

/** Tipo esperado a partir da extensão da chave. */
export function contentTypeOfKey(key: string): ImageContentType | null {
  const extension = key.slice(key.lastIndexOf('.') + 1);
  const entry = Object.entries(IMAGE_CONTENT_TYPES).find(
    ([, ext]) => ext === extension,
  );
  return entry ? (entry[0] as ImageContentType) : null;
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** Os primeiros bytes do arquivo são mesmo do formato declarado? */
export function matchesImageSignature(
  contentType: ImageContentType,
  bytes: Uint8Array,
): boolean {
  switch (contentType) {
    case 'image/jpeg':
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case 'image/png':
      return (
        bytes.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (byte, i) => bytes[i] === byte,
        )
      );
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        ascii(bytes, 0, 4) === 'RIFF' &&
        ascii(bytes, 8, 12) === 'WEBP'
      );
  }
}

/** Prefixos de cada tipo de imagem (o id do recurso entra no caminho). */
export const imagePrefixes = {
  eventCover: (eventId: number) => `events/${eventId}/cover`,
  eventPhotos: (eventId: number) => `events/${eventId}/photos`,
  userAvatar: (userId: string) => `users/${encodeURIComponent(userId)}/avatar`,
};
