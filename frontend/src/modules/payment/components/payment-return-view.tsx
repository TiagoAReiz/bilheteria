"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  CheckCircle2Icon,
  CircleXIcon,
  ExternalLinkIcon,
  HourglassIcon,
  Loader2Icon,
  RefreshCwIcon,
  Undo2Icon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatBRL } from "@/shared/lib/money";
import { useCountdown } from "../hooks/useCountdown";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { isPaymentId, isTrustedCheckoutUrl } from "../services/payment.service";
import type { PaymentResponse, PaymentReturnVariant, PaymentStatus } from "../types/payment.dto";

const RETURN_LABEL: Record<PaymentReturnVariant, string> = {
  success: "pagamento aprovado",
  pending: "pagamento em processamento",
  failure: "pagamento não concluído",
};

const STATUS_COPY: Record<PaymentStatus, { title: string; description: string; icon: ReactNode }> = {
  pending: {
    title: "Aguardando a confirmação do pagamento",
    description:
      "Assim que o Mercado Pago confirmar, o ingresso fica garantido. Esta página se atualiza sozinha; Pix costuma levar poucos segundos.",
    icon: <HourglassIcon aria-hidden />,
  },
  approved: {
    title: "Pagamento confirmado!",
    description: "Seu ingresso está garantido.",
    icon: <CheckCircle2Icon aria-hidden />,
  },
  rejected: {
    title: "Pagamento recusado",
    description: "O Mercado Pago recusou o pagamento. Se a reserva ainda estiver valendo, tente de novo com outro meio.",
    icon: <CircleXIcon aria-hidden />,
  },
  cancelled: {
    title: "Pagamento cancelado",
    description: "Nada foi cobrado. Reserve o ingresso de novo para tentar outra vez.",
    icon: <CircleXIcon aria-hidden />,
  },
  expired: {
    title: "Pagamento expirado",
    description: "A reserva acabou antes do pagamento. Nada foi cobrado; reserve o ingresso de novo.",
    icon: <CircleXIcon aria-hidden />,
  },
  refunded: {
    title: "Pagamento estornado",
    description:
      "O pagamento foi aprovado depois que a reserva expirou (ou o ingresso já não estava disponível), então o valor foi devolvido automaticamente.",
    icon: <Undo2Icon aria-hidden />,
  },
};

/**
 * Tela de retorno do Checkout Pro (/payment/success|pending|failure). O endereço de retorno é
 * só uma dica: o status mostrado é o que a API registrou, que vem do webhook do Mercado Pago.
 */
export function PaymentReturnView({ variant }: { variant: PaymentReturnVariant }) {
  const params = useSearchParams();
  // nós mandamos ?payment_id=; o Mercado Pago também devolve external_reference (o mesmo id)
  const raw = params.get("payment_id") ?? params.get("external_reference");
  const paymentId = isPaymentId(raw) ? raw : null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Pagamento</h1>
      <p className="text-sm text-muted-foreground">
        Você voltou do Mercado Pago pela página de &ldquo;{RETURN_LABEL[variant]}&rdquo;. O status abaixo é o
        registrado pela bilheteria, confirmado diretamente com o Mercado Pago.
      </p>
      {paymentId ? (
        <PaymentStatusPanel paymentId={paymentId} />
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Pagamento não identificado</AlertTitle>
          <AlertDescription>
            <p>O endereço não traz um identificador de pagamento válido.</p>
          </AlertDescription>
        </Alert>
      )}
      <Button asChild variant="outline">
        <Link href="/">Voltar para os eventos</Link>
      </Button>
    </div>
  );
}

function PaymentStatusPanel({ paymentId }: { paymentId: string }) {
  const { payment, error, loading, polling, gaveUp, refresh } = usePaymentStatus(paymentId);

  if (loading && !payment) {
    return <Skeleton className="h-40 w-full" data-testid="payment-loading" />;
  }
  if (error && !payment) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{error.status === 404 ? "Pagamento não encontrado" : "Não foi possível consultar o pagamento"}</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          {error.status !== 404 ? (
            <Button size="sm" variant="outline" className="mt-2" onClick={refresh}>
              <RefreshCwIcon aria-hidden /> Tentar de novo
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (!payment) return null;
  return <PaymentStatusCard payment={payment} polling={polling} gaveUp={gaveUp} onRefresh={refresh} />;
}

interface PaymentStatusCardProps {
  payment: PaymentResponse;
  polling: boolean;
  gaveUp: boolean;
  onRefresh: () => void;
}

function PaymentStatusCard({ payment, polling, gaveUp, onRefresh }: PaymentStatusCardProps) {
  const copy = STATUS_COPY[payment.status];
  // o checkout só aceita pagamento até o fim da reserva
  const { expired } = useCountdown(payment.expires_at);
  const canResume =
    payment.status === "pending" &&
    !expired &&
    payment.checkout_url !== null &&
    isTrustedCheckoutUrl(payment.checkout_url);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" role="status" aria-live="polite">
          {copy.icon} {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="font-medium">{formatBRL(payment.amount_cents)}</dd>
          <dt className="text-muted-foreground">Ingresso</dt>
          <dd className="font-medium">#{payment.ticket_id}</dd>
        </dl>
        {polling ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden /> Consultando o status...
          </p>
        ) : null}
        {gaveUp ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A confirmação está demorando mais que o normal. Você pode atualizar daqui a pouco.
            </p>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCwIcon aria-hidden /> Atualizar
            </Button>
          </div>
        ) : null}
        {canResume ? (
          <Button asChild size="sm">
            <a href={payment.checkout_url as string}>
              <ExternalLinkIcon aria-hidden /> Voltar ao pagamento
            </a>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
