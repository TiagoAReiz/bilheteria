"use client";

import { useEffect, useRef, useState } from "react";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";
import { paymentService } from "../services/payment.service";
import type { PaymentResponse } from "../types/payment.dto";

export const PAYMENT_POLL_INTERVAL_MS = 3000;
/** ~2 minutos de consulta enquanto pendente; depois a pessoa atualiza manualmente. */
export const PAYMENT_POLL_MAX_ATTEMPTS = 40;

/**
 * Consulta GET /payments/:id e repete a cada 3 s enquanto o status for `pending`: a
 * confirmação chega pelo webhook do Mercado Pago, não pela URL de retorno.
 */
export function usePaymentStatus(paymentId: string | null) {
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [loading, setLoading] = useState(paymentId !== null);
  const [gaveUp, setGaveUp] = useState(false);
  const [round, setRound] = useState(0);
  const attempts = useRef(0);

  useEffect(() => {
    if (paymentId === null) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      attempts.current += 1;
      try {
        const current = await paymentService.getPayment(paymentId);
        if (cancelled) return;
        setPayment(current);
        setError(null);
        if (current.status !== "pending") return;
        if (attempts.current >= PAYMENT_POLL_MAX_ATTEMPTS) {
          setGaveUp(true);
          return;
        }
        timer = window.setTimeout(() => void poll(), PAYMENT_POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError({ status: getErrorStatus(err), message: getErrorMessage(err, "Não foi possível consultar o pagamento.") });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [paymentId, round]);

  /** Recomeça a consulta (botão "Atualizar"). */
  const refresh = () => {
    attempts.current = 0;
    setGaveUp(false);
    setLoading(true);
    setRound((r) => r + 1);
  };

  return { payment, error, loading, polling: payment?.status === "pending" && !gaveUp, gaveUp, refresh };
}
