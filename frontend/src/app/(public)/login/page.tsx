import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { LoginCard } from "@/modules/login/components/login-card";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="flex justify-center py-12">
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-sm" />}>
        <LoginCard />
      </Suspense>
    </div>
  );
}
