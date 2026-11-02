"use client";

import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useBecomeOrganizer } from "../hooks/useBecomeOrganizer";

export function BecomeOrganizerCard({ onBecameOrganizer }: { onBecameOrganizer?: () => void }) {
  const { becomeOrganizer, loading, error } = useBecomeOrganizer();

  async function handleClick() {
    const failure = await becomeOrganizer();
    if (failure) {
      toast.error(failure);
      return;
    }
    toast.success("Agora você é organizador e pode criar eventos!");
    onBecameOrganizer?.();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organize seus eventos</CardTitle>
        <CardDescription>Organizadores podem criar eventos e vender ingressos na Bilheteria.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleClick} disabled={loading}>
          {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          Quero ser organizador
        </Button>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
