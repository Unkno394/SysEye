import { Suspense } from "react";
import { ConfirmEmailClient } from "@/components/confirm-email-client";

export default async function ConfirmEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailClient />
    </Suspense>
  );
}
