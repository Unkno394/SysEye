"use client";

import { useEffect, useState } from "react";
import { getReadableApiError } from "@/lib/api-error";
import { PrimaryButton } from "@/components/ui";

type EmailConfirmationPanelProps = {
  email?: string | null;
  initialMessage?: string;
  successMessage?: string;
  onSuccess?: () => void;
};

export function EmailConfirmationPanel({
  email,
  initialMessage = "Мы отправили код подтверждения на почту. Введи его ниже, чтобы завершить подтверждение email.",
  successMessage = "Почта подтверждена.",
  onSuccess,
}: EmailConfirmationPanelProps) {
  const emailValue = email ?? "";
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [resendCooldown]);

  const resendCode = async () => {
    if (resendCooldown > 0) {
      return;
    }

    setResending(true);
    setError(null);

    try {
      const response = await fetch("/api/hackaton/emailconfirm", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await getReadableApiError(response, "Не удалось отправить код повторно."));
      }

      setMessage(`Код отправлен повторно${emailValue ? ` на ${emailValue}` : ""}.`);
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось отправить код повторно.");
    } finally {
      setResending(false);
    }
  };

  const confirmCode = async () => {
    if (!code.trim()) {
      setError("Введи код из письма.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/hackaton/emailconfirm/confirm?token=${encodeURIComponent(code.trim())}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await getReadableApiError(response, "Не удалось подтвердить почту по коду."));
      }

      setConfirmed(true);
      setMessage(successMessage);
      onSuccess?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось подтвердить почту по коду.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-[1.4rem] border px-4 py-4 text-sm leading-6 backdrop-blur-sm ${
          confirmed
            ? "border-accent/15 bg-accent/[0.08] text-white/70"
            : "border-white/10 bg-white/[0.03] text-white/65"
        }`}
      >
        {message}
      </div>

      {emailValue ? (
        <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60 backdrop-blur-sm">
          Код подтверждения будет отправлен на <span className="text-white">{emailValue}</span>
        </div>
      ) : null}

      <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
        <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Код подтверждения</label>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-accent/30 focus:bg-white/[0.06]"
          placeholder="Например: 4821"
          inputMode="numeric"
        />
      </div>

      {error ? (
        <div className="rounded-[1.4rem] border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm leading-6 text-rose-100/90 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PrimaryButton onClick={confirmCode} className="min-w-[180px]" disabled={submitting}>
          {submitting ? "Проверка..." : "Подтвердить почту"}
        </PrimaryButton>
        <button
          type="button"
          onClick={resendCode}
          disabled={resending || resendCooldown > 0}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 font-medium text-white/70 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resending ? "Отправка..." : "Отправить код повторно"}
        </button>
      </div>
    </div>
  );
}
