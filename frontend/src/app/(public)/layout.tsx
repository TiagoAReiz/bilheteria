import type { ReactNode } from "react";
import { AppHeader } from "@/shared/components/layout/app-header";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
