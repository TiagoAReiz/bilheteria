"use client";

import { CreditCardIcon, Loader2Icon, TimerIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { useCheckout } from "../hooks/useCheckout";
import { formatCountdown, useCountdown } from "../hooks/useCountdown";

interface PayTicketButtonProps {
  ticketId: number;
  /** Fim da reserva: depois disso não dá mais para pagar este ticket. */
  expiresAt: Date;
}

/** "Pagar" leva para o Checkout Pro do Mercado Pago, com contagem regressiva até o fim da reserva. */
export function PayTicketButton({ ticketId, expiresAt }: PayTicketButtonProps) {
  const { remainingMs, expired } = useCountdown(expiresAt);
  const { pay, loading, error } = useCheckout(ticketId);

  if (expired) {
    return (
      <Alert variant="destructive" role="alert">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>Sua reserva expirou</AlertTitle>
        <AlertDescription>
          <p>O ingresso voltou a ficar disponível. Reserve de novo para pagar.</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => void pay()} disabled={loading}>
          {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : <CreditCardIcon aria-hidden />}
          {loading ? "Abrindo pagamento..." : "Pagar"}
        </Button>
        <p className="flex items-center gap-1 text-sm text-muted-foreground" aria-live="off">
          <TimerIcon className="size-4" aria-hidden />
          Tempo para pagar:{" "}
          <time className="font-medium tabular-nums" data-testid="payment-countdown">
            {formatCountdown(remainingMs)}
          </time>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Você será levado ao Mercado Pago para pagar com Pix ou cartão.
      </p>
      {error ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Não foi possível abrir o pagamento</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
