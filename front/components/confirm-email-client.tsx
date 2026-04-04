"use client";

import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { EmailConfirmationPanel } from "@/components/email-confirmation-panel";

export function ConfirmEmailClient() {
  return (
    <AuthShell
      title="Подтверждение почты"
      subtitle="Введи код из письма, чтобы завершить активацию аккаунта."
    >
      <EmailConfirmationPanel successMessage="Почта подтверждена. Теперь можно вернуться ко входу." />

      <div className="mt-6 flex gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 font-medium text-accent transition hover:bg-accent/18"
        >
          Перейти ко входу
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 font-medium text-white/70 transition hover:bg-white/[0.07] hover:text-white"
        >
          Назад к регистрации
        </Link>
      </div>
    </AuthShell>
  );
}
