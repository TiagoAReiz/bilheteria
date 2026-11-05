"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useSession } from "@/shared/hooks/useSession";
import { safeRedirectPath } from "@/shared/lib/auth-redirect";
import { useSocialSignIn } from "../hooks/useSocialSignIn";
import type { SocialProvider } from "../types/login.dto";

const providers: { id: SocialProvider; label: string }[] = [
  { id: "google", label: "Entrar com Google" },
  { id: "facebook", label: "Entrar com Facebook" },
];

export function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = safeRedirectPath(searchParams.get("redirect"));
  const { status } = useSession();
  const { signIn, pending } = useSocialSignIn(redirectPath);

  useEffect(() => {
    if (status === "authenticated") router.replace(redirectPath);
  }, [status, router, redirectPath]);

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Entrar</CardTitle>
        <CardDescription>
          Use sua conta Google ou Facebook para reservar ingressos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {providers.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            size="lg"
            onClick={() => void signIn(p.id)}
            disabled={pending !== null || status !== "unauthenticated"}
          >
            {pending === p.id ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : null}
            {p.label}
          </Button>
        ))}
        {status === "authenticated" ? (
          <p className="text-center text-sm text-muted-foreground">
            Você já está logado. Redirecionando...
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
