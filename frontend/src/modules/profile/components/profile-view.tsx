"use client";

import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSession } from "@/shared/hooks/useSession";
import { safeRedirectPath } from "@/shared/lib/auth-redirect";
import { useProfile } from "../hooks/useProfile";
import { BecomeOrganizerCard } from "./become-organizer-card";
import { CpfForm } from "./cpf-form";
import { ProfileCard } from "./profile-card";

export function ProfileView() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const returnTo = redirect ? safeRedirectPath(redirect) : null;
  const { user, loading, error, reload } = useProfile();
  const { refresh } = useSession();

  // perfil e sessão juntos: o header lê a sessão (papel, foto)
  async function reloadProfileAndSession() {
    await Promise.all([reload(), refresh()]);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Meu perfil</h1>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error || !user ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar seu perfil</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void reload()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <ProfileCard user={user} onAvatarChanged={reloadProfileAndSession} />
          {user.role === "USER" ? <BecomeOrganizerCard onBecameOrganizer={reloadProfileAndSession} /> : null}
        </>
      )}

      <CpfForm returnTo={returnTo} />
    </div>
  );
}
