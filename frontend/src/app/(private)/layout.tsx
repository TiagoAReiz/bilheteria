import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/shared/components/layout/app-header";
import { PrivateSidebar } from "@/shared/components/layout/private-sidebar";
import { RequireSession } from "@/shared/components/layout/require-session";
import { Skeleton } from "@/shared/components/ui/skeleton";

// PrivateSidebar e RequireSession leem usePathname(): em rotas dinâmicas (ex.: /events/[id]/edit) a URL
// só existe na requisição, então o Next exige um <Suspense> em volta para pré-renderizar o resto.
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <Suspense fallback={null}>
        <PrivateSidebar />
      </Suspense>
      <main className="w-full flex-1 px-4 py-8 md:pl-64">
        <div className="mx-auto max-w-3xl">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <RequireSession>{children}</RequireSession>
          </Suspense>
        </div>
      </main>
    </>
  );
}
