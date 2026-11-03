import type { Metadata } from "next";
import { MyTicketsView } from "@/modules/my-tickets/components/my-tickets-view";

export const metadata: Metadata = { title: "Minhas reservas" };

export default function MyTicketsPage() {
  return <MyTicketsView />;
}
