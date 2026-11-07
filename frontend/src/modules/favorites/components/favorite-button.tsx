"use client";

import { usePathname, useRouter } from "next/navigation";
import { HeartIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useSession } from "@/shared/hooks/useSession";
import { buildLoginUrl } from "@/shared/lib/auth-redirect";
import { cn } from "@/shared/lib/utils";
import { useOptionalFavorites } from "../hooks/useFavorites";

interface FavoriteButtonProps {
  eventId: number;
  eventName: string;
  className?: string;
}

/** Coração de favoritar. Sem sessão leva ao login e volta para a mesma página. */
export function FavoriteButton(props: FavoriteButtonProps) {
  const favorites = useOptionalFavorites();
  // sem o provider (fora do app, ex.: card isolado) não há favoritos para mostrar
  if (!favorites) return null;
  return (
    <FavoriteToggle
      {...props}
      isFavorite={favorites.isFavorite}
      toggle={favorites.toggle}
    />
  );
}

function FavoriteToggle({
  eventId,
  eventName,
  className,
  isFavorite,
  toggle,
}: FavoriteButtonProps & {
  isFavorite: (eventId: number) => boolean;
  toggle: (eventId: number) => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const active = isFavorite(eventId);

  function handleClick() {
    if (status !== "authenticated") {
      router.push(buildLoginUrl(pathname || "/"));
      return;
    }
    void toggle(eventId);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-pressed={active}
      aria-label={
        active ? `Remover ${eventName} dos favoritos` : `Favoritar ${eventName}`
      }
      title={active ? "Remover dos favoritos" : "Favoritar"}
      disabled={status === "loading"}
      onClick={handleClick}
      className={cn("rounded-full bg-background/90 backdrop-blur", className)}
    >
      <HeartIcon
        aria-hidden
        className={cn(active && "fill-red-500 text-red-500")}
      />
    </Button>
  );
}
