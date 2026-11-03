/** Regras puras de redirecionamento de autenticação (usadas pelo proxy e pelo front). */

export const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const;

export const PRIVATE_PATHS = ["/profile", "/events/new", "/payment", "/my-tickets"] as const;

export const LOGIN_PATH = "/login";

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function hasSessionCookie(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) {
    if ((SESSION_COOKIE_NAMES as readonly string[]).includes(name)) return true;
  }
  return false;
}

/** Aceita apenas caminhos relativos internos (evita open redirect). */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

export function buildLoginUrl(redirectTo: string): string {
  return `${LOGIN_PATH}?redirect=${encodeURIComponent(redirectTo)}`;
}

interface AuthRedirectInput {
  pathname: string;
  search?: string;
  hasSession: boolean;
}

/**
 * Decide se a requisição deve ser redirecionada para o login.
 * Retorna o caminho de destino (ex.: `/login?redirect=%2Fprofile`) ou `null` para seguir.
 * Checagem otimista: só olha a presença do cookie; quem valida a sessão é o backend.
 */
export function getAuthRedirect({ pathname, search = "", hasSession }: AuthRedirectInput): string | null {
  if (hasSession || !isPrivatePath(pathname)) return null;
  return buildLoginUrl(`${pathname}${search}`);
}
