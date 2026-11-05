import { ImageKind, PresignedUpload } from '../../../../core/entities/image.js';

export const IMAGE_STORAGE_SERVICE = Symbol('IMAGE_STORAGE_SERVICE');

/**
 * Upload direto do navegador para o bucket, em dois passos:
 * 1. `createUpload`: valida o tipo, gera a chave no servidor e devolve um POST pré-assinado
 *    que o próprio S3 recusa se o arquivo passar do tamanho ou vier com outro Content-Type;
 * 2. `confirmUpload`: confere no bucket que o objeto existe, com tamanho, tipo e assinatura
 *    válidos, antes de quem chamou gravar a chave no banco.
 * Quem pode enviar para qual prefixo é decidido por quem chama (event, users).
 */
export interface ImageStorageServicePort {
  /** 400 se o tipo não for jpeg/png/webp; 503 se o bucket estiver fora. */
  createUpload(
    kind: ImageKind,
    prefix: string,
    contentType: string,
  ): Promise<PresignedUpload>;
  /** 400 se a chave não for deste prefixo, não existir ou não for uma imagem válida (o objeto inválido é apagado). */
  confirmUpload(kind: ImageKind, prefix: string, key: string): Promise<void>;
  publicUrl(key: string): string;
  publicUrlOrNull(key: string | null | undefined): string | null;
  /** Apaga sem propagar erro (melhor esforço: falha vira log e métrica). */
  deleteQuietly(kind: ImageKind, key: string | null | undefined): Promise<void>;
}
