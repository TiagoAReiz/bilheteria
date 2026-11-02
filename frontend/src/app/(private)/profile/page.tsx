import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ProfileView } from "@/modules/profile/components/profile-view";

export const metadata: Metadata = { title: "Meu perfil" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProfileView />
    </Suspense>
  );
}
