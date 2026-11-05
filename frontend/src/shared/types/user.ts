export type Role = "USER" | "ORGANIZER" | "ADMIN";

/** Resposta de GET /users/me (e `user` da sessão do Better Auth). */
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** Foto do Google/Facebook (Better Auth). */
  image?: string | null;
  /** Avatar servido: o enviado pelo usuário ou, sem ele, `image`. Vem da sessão (customSession). */
  avatarUrl?: string | null;
  /** Chave do avatar enviado no bucket; null = usando a foto do provedor (ou nenhuma). */
  avatarKey?: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export function canCreateEvents(
  user: Pick<User, "role"> | null | undefined,
): boolean {
  return user?.role === "ORGANIZER" || user?.role === "ADMIN";
}
