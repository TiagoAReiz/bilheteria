"use client";

import { useCallback, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";
import { onlyDigits } from "@/shared/lib/cpf";
import { profileService } from "../services/profile.service";

export type RegisterCpfOutcome = "registered" | "already_registered" | "error";

/** Mensagem do backend quando a conta já tem CPF (409). Outro 409 é "CPF de outra conta". */
const ALREADY_REGISTERED_HINT = "não pode ser alterado";

export function useRegisterCpf() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** true quando sabemos que a conta já tem CPF (sucesso ou 409 de "já cadastrado"). */
  const [locked, setLocked] = useState(false);

  const register = useCallback(
    async (cpf: string): Promise<RegisterCpfOutcome> => {
      setLoading(true);
      setError(null);
      try {
        await profileService.registerCpf(onlyDigits(cpf));
        setLocked(true);
        return "registered";
      } catch (err) {
        const message = getErrorMessage(
          err,
          "Não foi possível cadastrar o CPF.",
        );
        setError(message);
        if (
          getErrorStatus(err) === 409 &&
          message.toLowerCase().includes(ALREADY_REGISTERED_HINT)
        ) {
          setLocked(true);
          return "already_registered";
        }
        return "error";
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { register, loading, error, locked };
}
