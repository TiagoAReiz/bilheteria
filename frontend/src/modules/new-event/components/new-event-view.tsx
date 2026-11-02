"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSession } from "@/shared/hooks/useSession";
import { canCreateEvents } from "@/shared/types/user";
import { NewEventForm } from "./new-event-form";

/** Só ORGANIZER/ADMIN veem o formulário; o backend também valida (403). */
export function NewEventView() {
  const { user, status } = useSession();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Criar evento</h1>
      {status === "loading" ? (
        <Skeleton className="h-96 w-full" />
      ) : canCreateEvents(user) ? (
        <NewEventForm />
      ) : (
        <Alert>
          <AlertTitle>Apenas organizadores podem criar eventos</AlertTitle>
          <AlertDescription>
            <p>Para publicar eventos, ative o perfil de organizador na sua página de perfil.</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/profile">Ir para o perfil</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
