"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/shared/hooks/useSession";
import { Toaster } from "@/shared/components/ui/sonner";
import { FavoritesProvider } from "@/modules/favorites/hooks/useFavorites";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <FavoritesProvider>
        {children}
        <Toaster richColors position="top-right" />
      </FavoritesProvider>
    </SessionProvider>
  );
}
