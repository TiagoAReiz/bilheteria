import type { User } from "@/shared/types/user";

/** Resposta de GET /users/me: o usuário da sessão + se a conta já tem CPF cadastrado. */
export interface UserMeResponse extends User {
  hasCpf: boolean;
  /** CPF mascarado (***.456.789-**); null sem CPF ou em contas cadastradas antes da máscara existir. */
  cpfMasked: string | null;
}

/** Resposta de PUT/DELETE /users/me/avatar: o avatar servido agora (null = iniciais). */
export interface AvatarResponse {
  avatar_url: string | null;
}

/** Body de PATCH /users/me/cpf (responde 204) */
export interface RegisterCpfRequest {
  cpf: string;
}
