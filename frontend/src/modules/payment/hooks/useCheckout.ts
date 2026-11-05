"use client";

import { useCallback, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";
import { hardRedirect } from "@/shared/lib/navigation";
import { paymentService } from "../services/payment.service";

/** Abre o checkout no backend e leva o navegador para a página do Mercado Pago. */
export function useCheckout(ticketId: number) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    status?: number;
    message: string;
  } | null>(null);

  const pay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const checkout = await paymentService.createCheckout(ticketId);
      // continua "carregando" até o navegador sair da página
      hardRedirect(checkout.checkout_url);
      return true;
    } catch (err) {
      setError({
        status: getErrorStatus(err),
        message: getErrorMessage(err, "Não foi possível abrir o pagamento."),
      });
      setLoading(false);
      return false;
    }
  }, [ticketId]);

  return { pay, loading, error };
}
