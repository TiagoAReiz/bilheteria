import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { EventDetailView } from "@/modules/event-detail/components/event-detail-view";

export const metadata: Metadata = { title: "Evento" };

export default function EventDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EventDetailView />
    </Suspense>
  );
}
