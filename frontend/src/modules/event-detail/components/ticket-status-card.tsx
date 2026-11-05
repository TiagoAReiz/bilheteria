import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatNumber } from "@/shared/lib/format";
import type { TicketStatusResponse } from "../types/event-detail.dto";

interface TicketStatusCardProps {
  status: TicketStatusResponse | null;
  loading: boolean;
  error: string | null;
}

export function TicketStatusCard({
  status,
  loading,
  error,
}: TicketStatusCardProps) {
  if (loading)
    return (
      <Skeleton className="h-20 w-full" data-testid="ticket-status-loading" />
    );
  if (error || !status) {
    return (
      <p className="text-sm text-muted-foreground">
        Status dos ingressos indisponível no momento.
      </p>
    );
  }

  const items = [
    { label: "Total", value: status.total },
    { label: "Disponíveis", value: status.available },
    { label: "Reservados", value: status.reserved },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3 text-center">
          <dt className="text-xs text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {formatNumber(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
