import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirect, hasSessionCookie } from "@/shared/lib/auth-redirect";

/**
 * Checagem otimista: só confere se o cookie de sessão do Better Auth existe.
 * A validação real é feita pelo backend (401 -> interceptor do axios manda para /login).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = getAuthRedirect({
    pathname,
    search,
    hasSession: hasSessionCookie(request.cookies.getAll().map((c) => c.name)),
  });

  if (target) return NextResponse.redirect(new URL(target, request.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/profile/:path*",
    "/events/new",
    "/events/:id/edit",
    "/payment/:path*",
    "/my-tickets/:path*",
  ],
};
