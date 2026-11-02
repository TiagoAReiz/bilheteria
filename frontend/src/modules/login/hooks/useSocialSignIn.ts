"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/shared/lib/api-error";
import { hardRedirect } from "@/shared/lib/navigation";
import { loginService } from "../services/login.service";
import type { SocialProvider } from "../types/login.dto";

/** Inicia o OAuth no Better Auth e redireciona o navegador para o provedor. */
export function useSocialSignIn(redirectPath: string) {
  const [pending, setPending] = useState<SocialProvider | null>(null);

  const signIn = useCallback(
    async (provider: SocialProvider) => {
      setPending(provider);
      try {
        const callbackURL = new URL(redirectPath, window.location.origin).toString();
        const { url } = await loginService.signInSocial(provider, callbackURL);
        hardRedirect(url);
      } catch (err) {
        toast.error(getErrorMessage(err, "Não foi possível iniciar o login."));
        setPending(null);
      }
    },
    [redirectPath],
  );

  return { signIn, pending };
}
