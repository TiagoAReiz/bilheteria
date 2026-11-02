"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/shared/hooks/useSession";
import { Toaster } from "@/shared/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster richColors position="top-right" />
    </SessionProvider>
  );
}
