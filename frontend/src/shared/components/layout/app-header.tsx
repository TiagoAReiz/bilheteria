"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TicketIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { UserAvatar } from "@/shared/components/user-avatar";
import { useSession } from "@/shared/hooks/useSession";
import { buildLoginUrl } from "@/shared/lib/auth-redirect";

const sessionSkeleton = <Skeleton className="h-8 w-28" data-testid="header-session-loading" />;

/** Avatar/nome do usuário logado ou botão "Entrar". */
export function HeaderUserArea() {
  const { user, status } = useSession();
  const pathname = usePathname();

  if (status === "loading") return sessionSkeleton;

  if (user) {
    return (
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted"
        aria-label={`Perfil de ${user.name}`}
      >
        <UserAvatar user={user} size="sm" />
        <span className="hidden max-w-40 truncate sm:inline">{user.name}</span>
      </Link>
    );
  }

  return (
    <Button asChild size="sm">
      <Link href={!pathname || pathname === "/login" ? "/login" : buildLoginUrl(pathname)}>Entrar</Link>
    </Button>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <TicketIcon className="size-5" aria-hidden />
          Bilheteria
        </Link>

        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Eventos</Link>
          </Button>
          <Suspense fallback={sessionSkeleton}>
            <HeaderUserArea />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
