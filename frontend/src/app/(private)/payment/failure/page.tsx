import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { PaymentReturnView } from "@/modules/payment/components/payment-return-view";

export const metadata: Metadata = { title: "Pagamento não concluído" };

/** Retorno do Checkout Pro do Mercado Pago (auto_return). O status real vem da API. */
export default function PaymentFailurePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PaymentReturnView variant="failure" />
    </Suspense>
  );
}
