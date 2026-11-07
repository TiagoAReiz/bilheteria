import type { Metadata } from "next";
import { FavoritesView } from "@/modules/favorites/components/favorites-view";

export const metadata: Metadata = { title: "Favoritos" };

export default function FavoritesPage() {
  return <FavoritesView />;
}
