"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, Loader2Icon, TicketIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useSession } from "@/shared/hooks/useSession";
import { buildLoginUrl } from "@/shared/lib/auth-redirect";
import { formatTime } from "@/shared/lib/format";
import { PayTicketButton } from "@/modules/payment/components/pay-ticket-button";
import { CpfRegistrationForm } from "@/modules/profile/components/cpf-form";
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
  const [cpfDialogOpen, setCpfDialogOpen] = useState(false);
  const eventPath = `/events/${eventId}`;

  async function attemptReservation() {
    const outcome = await reserve();
    if (isReserveError(outcome)) {
      // sem CPF a reserva não sai: pede o CPF ali mesmo e tenta de novo depois do cadastro
      if (outcome.kind === "cpf_required") setCpfDialogOpen(true);
      else toast.error(outcome.message);
      return;
    }
    toast.success("Ingresso reservado!");
    onReserved?.();
  }

  async function handleClick() {
    if (!user) {
      router.push(buildLoginUrl(eventPath));
      return;
    }
    await attemptReservation();
  }

  async function handleCpfRegistered() {
    setCpfDialogOpen(false);
    await attemptReservation();
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
          <AlertDescription className="space-y-3">
            <p>
              Sua reserva expira em {RESERVATION_TTL_MINUTES} minutos (às {formatTime(result.expiresAt)}) se o pagamento
              não for concluído. Depois disso o ingresso volta a ficar disponível.
            </p>
            {/* key: uma nova reserva recomeça a contagem e o estado do pagamento */}
            <PayTicketButton key={result.ticket.id} ticketId={result.ticket.id} expiresAt={result.expiresAt} />
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
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setCpfDialogOpen(true)}>
                Cadastrar CPF
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={cpfDialogOpen} onOpenChange={setCpfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastre seu CPF para reservar</DialogTitle>
            <DialogDescription>
              O CPF é obrigatório para reservar ingressos e limita quantos ingressos cada pessoa pode ter neste evento.
              Ele é cadastrado uma única vez e não pode ser alterado depois. Assim que cadastrar, sua reserva continua.
            </DialogDescription>
          </DialogHeader>
          <CpfRegistrationForm onRegistered={() => void handleCpfRegistered()} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
