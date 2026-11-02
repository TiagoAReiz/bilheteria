import type { Metadata } from "next";
import { NewEventView } from "@/modules/new-event/components/new-event-view";

export const metadata: Metadata = { title: "Criar evento" };

export default function NewEventPage() {
  return <NewEventView />;
}
