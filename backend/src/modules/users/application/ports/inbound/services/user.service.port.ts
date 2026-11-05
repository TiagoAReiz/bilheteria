import { PresignedUpload } from '../../../../../storage/core/entities/image.js';

export const USER_SERVICE = Symbol('USER_SERVICE');

export interface UserServicePort {
  registerCpf(userId: string, rawCpf: string): Promise<void>;
  hasCpf(userId: string): Promise<boolean>;
  /** Situação do CPF para o perfil: se existe e a versão mascarada (null em contas antigas). */
  getCpfStatus(
    userId: string,
  ): Promise<{ hasCpf: boolean; cpfMasked: string | null }>;
  becomeOrganizer(userId: string): Promise<void>;
  /** POST pré-assinado para o navegador enviar o avatar direto ao bucket. */
  createAvatarUpload(
    userId: string,
    contentType: string,
  ): Promise<PresignedUpload>;
  /** Confere o objeto no bucket, troca o avatar e apaga o anterior (melhor esforço). */
  confirmAvatar(userId: string, key: string): Promise<{ avatar_url: string }>;
  /** Volta para a foto do provedor social (ou nenhuma); devolve o avatar servido agora. */
  removeAvatar(userId: string): Promise<{ avatar_url: string | null }>;
}
