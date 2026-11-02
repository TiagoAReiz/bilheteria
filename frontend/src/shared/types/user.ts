export type Role = "USER" | "ORGANIZER" | "ADMIN";

/** Resposta de GET /users/me (e `user` da sessão do Better Auth). */
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export function canCreateEvents(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "ORGANIZER" || user?.role === "ADMIN";
}
