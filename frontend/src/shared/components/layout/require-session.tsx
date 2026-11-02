"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSession } from "@/shared/hooks/useSession";
import { buildLoginUrl } from "@/shared/lib/auth-redirect";

/**
 * Segunda barreira no cliente: o proxy só confere a presença do cookie.
 * Se o backend disser que não há sessão (cookie expirado/inválido), manda para o login.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(buildLoginUrl(pathname || "/"));
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
