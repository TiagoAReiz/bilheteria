"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, Loader2Icon, TicketIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { useSession } from "@/shared/hooks/useSession";
import { buildLoginUrl } from "@/shared/lib/auth-redirect";
import { formatTime } from "@/shared/lib/format";
import { isReserveError, useReserveTicket } from "../hooks/useReserveTicket";
import { RESERVATION_TTL_MINUTES } from "../types/event-detail.dto";

interface ReserveTicketButtonProps {
  eventId: number;
  disabled?: boolean;
  onReserved?: () => void;
}

export function ReserveTicketButton({ eventId, disabled, onReserved }: ReserveTicketButtonProps) {
  const router = useRouter();
  const { user, status } = useSession();
  const { reserve, loading, result, error } = useReserveTicket(eventId);
  const eventPath = `/events/${eventId}`;
  const cpfPath = `/profile?redirect=${encodeURIComponent(eventPath)}`;

  async function handleClick() {
    if (!user) {
      router.push(buildLoginUrl(eventPath));
      return;
    }
    const outcome = await reserve();
    if (isReserveError(outcome)) {
      toast.error(outcome.message);
      if (outcome.kind === "cpf_required") router.push(cpfPath);
      return;
    }
    toast.success("Ingresso reservado!");
    onReserved?.();
  }

  return (
    <div className="space-y-4">
      <Button
        size="lg"
        className="w-full sm:w-auto"
        onClick={handleClick}
        disabled={disabled || loading || status === "loading"}
      >
        {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : <TicketIcon aria-hidden />}
        {loading ? "Reservando..." : "Reservar ingresso"}
      </Button>

      {result ? (
        <Alert>
          <CheckCircle2Icon aria-hidden />
          <AlertTitle>Reserva #{result.ticket.id} confirmada</AlertTitle>
          <AlertDescription>
            <p>
              Sua reserva expira em {RESERVATION_TTL_MINUTES} minutos (às {formatTime(result.expiresAt)}) se o pagamento
              não for concluído. Depois disso o ingresso volta a ficar disponível.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Não foi possível reservar</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            {error.kind === "cpf_required" ? (
              <Link href={cpfPath} className="font-medium underline underline-offset-4">
                Cadastrar CPF
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
