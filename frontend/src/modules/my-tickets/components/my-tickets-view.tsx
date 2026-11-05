"use client";

import Link from "next/link";
import { TicketIcon, TriangleAlertIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useMyTickets } from "../hooks/useMyTickets";
import { MyTicketCard } from "./my-ticket-card";

export function MyTicketsView() {
  const { tickets, loading, error, reload } = useMyTickets();

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Minhas reservas</h1>
        <p className="text-sm text-muted-foreground">
          Seus ingressos pagos e as reservas que ainda aguardam pagamento.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Não foi possível carregar suas reservas</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void reload()}
            >
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <TicketIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Você ainda não tem ingressos.
          </p>
          <Button asChild>
            <Link href="/">Ver eventos</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <MyTicketCard ticket={ticket} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
