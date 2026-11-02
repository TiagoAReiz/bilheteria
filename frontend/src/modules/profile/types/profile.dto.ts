import type { User } from "@/shared/types/user";

/** Resposta de GET /users/me */
export type UserMeResponse = User;

/** Body de PATCH /users/me/cpf (responde 204) */
export interface RegisterCpfRequest {
  cpf: string;
}
