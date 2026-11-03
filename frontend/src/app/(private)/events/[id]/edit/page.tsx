import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { EditEventView } from "@/modules/edit-event/components/edit-event-view";

export const metadata: Metadata = { title: "Editar evento" };

export default function EditEventPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EditEventView />
    </Suspense>
  );
}
