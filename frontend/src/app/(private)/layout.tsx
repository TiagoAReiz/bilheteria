import type { ReactNode } from "react";
import { AppHeader } from "@/shared/components/layout/app-header";
import { PrivateSidebar } from "@/shared/components/layout/private-sidebar";
import { RequireSession } from "@/shared/components/layout/require-session";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <PrivateSidebar />
      <main className="w-full flex-1 px-4 py-8 md:pl-64">
        <div className="mx-auto max-w-3xl">
          <RequireSession>{children}</RequireSession>
        </div>
      </main>
    </>
  );
}
