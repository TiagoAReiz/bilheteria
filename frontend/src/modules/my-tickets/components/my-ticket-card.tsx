import Link from "next/link";
import { CalendarIcon, MapPinIcon, TicketIcon } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { formatDateTime } from "@/shared/lib/format";
import { PayTicketButton } from "@/modules/payment/components/pay-ticket-button";
import type { MyTicketResponse } from "../types/my-tickets.dto";

export function MyTicketCard({ ticket }: { ticket: MyTicketResponse }) {
  const { event } = ticket;
  const paid = ticket.status === "paid";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-lg">
          <Link href={`/events/${event.id}`} className="hover:underline">
            {event.name}
          </Link>
        </CardTitle>
        {paid ? (
          <Badge>Pago</Badge>
        ) : (
          <Badge variant="secondary">Aguardando pagamento</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p className="flex items-center gap-2">
            <MapPinIcon className="size-4 shrink-0" aria-hidden />
            {event.location}
          </p>
          <p className="flex items-center gap-2">
            <CalendarIcon className="size-4 shrink-0" aria-hidden />
            <time dateTime={event.starts_at}>
              {formatDateTime(event.starts_at)}
            </time>
          </p>
          <p className="flex items-center gap-2">
            <TicketIcon className="size-4 shrink-0" aria-hidden />
            Ingresso nº {ticket.id}
          </p>
        </div>
        {!paid && ticket.reserved_until ? (
          <PayTicketButton
            ticketId={ticket.id}
            expiresAt={new Date(ticket.reserved_until)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
