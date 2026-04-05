"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "@/components/ui";
import { apiJson } from "@/lib/api-client";

type RecoveryStep = "request" | "confirm" | "reset" | "done";

export function PasswordRecoveryPanel({
  suggestedEmail = "",
  onClose,
  onSuccess,
}: {
  suggestedEmail?: string;
  onClose?: () => void;
  onSuccess?: (email: string) => void;
}) {
  const [step, setStep] = useState<RecoveryStep>("request");
  const [email, setEmail] = useState(suggestedEmail.trim());
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextEmail = suggestedEmail.trim();
    if (!nextEmail) {
      return;
    }

    setEmail((currentEmail) => currentEmail.trim() ? currentEmail : nextEmail);
  }, [suggestedEmail]);

  const resetToRequest = () => {
    setStep("request");
    setToken("");
    setNewPassword("");
    setRepeatPassword("");
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (step === "request") {
        if (!email.trim()) {
          throw new Error("Укажи почту, на которую нужно отправить код.");
        }

        await apiJson<void>(
          `/api/hackaton/password/recovery/email?email=${encodeURIComponent(email.trim())}`,
          { method: "GET" },
          "Не удалось отправить код для сброса.",
        );

        setStep("confirm");
        setMessage("Код отправлен на почту. Введи его ниже.");
        return;
      }

      if (step === "confirm") {
        if (!token.trim()) {
          throw new Error("Введи код из письма.");
        }

        await apiJson<void>(
          "/api/hackaton/password/recovery/validate",
          {
            method: "POST",
            body: JSON.stringify({
              email: email.trim(),
              token: token.trim(),
            }),
          },
          "Не удалось подтвердить код сброса.",
        );

        setStep("reset");
        setMessage("Код подтверждён. Теперь задай новый пароль.");
        return;
      }

      if (step === "reset") {
        if (newPassword !== repeatPassword) {
          throw new Error("Новый пароль и подтверждение не совпадают.");
        }

        await apiJson<void>(
          "/api/hackaton/password/reset",
          {
            method: "POST",
            body: JSON.stringify({
              newPassword,
            }),
          },
          "Не удалось задать новый пароль.",
        );

        setStep("done");
        setToken("");
        setNewPassword("");
        setRepeatPassword("");
        setMessage("Пароль обновлён. Теперь можно войти с новым паролем.");
        return;
      }

      if (onSuccess) {
        onSuccess(email.trim());
        return;
      }

      onClose?.();
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "Не удалось выполнить восстановление пароля.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">Восстановление пароля</div>
          <p className="mt-1 text-sm leading-6 text-white/55">
            Получи код на почту, подтверди его и задай новый пароль для аккаунта.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
          >
            Закрыть
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {step === "request" ? (
          <RecoveryField label="Почта" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
        ) : null}

        {step === "confirm" ? (
          <>
            <RecoveryField label="Почта" value={email} onChange={setEmail} placeholder="you@example.com" type="email" disabled />
            <RecoveryField label="Код из письма" value={token} onChange={setToken} placeholder="1234" />
          </>
        ) : null}

        {step === "reset" ? (
          <>
            <RecoveryField label="Новый пароль" value={newPassword} onChange={setNewPassword} placeholder="••••••••" type="password" />
            <RecoveryField label="Повтор нового пароля" value={repeatPassword} onChange={setRepeatPassword} placeholder="••••••••" type="password" />
          </>
        ) : null}

        {step === "done" ? (
          <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-4 text-sm leading-6 text-white/70">
            {message ?? "Пароль обновлён. Теперь можно вернуться ко входу."}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
            {step === "request" && "Отправим одноразовый код на подтверждённую почту аккаунта."}
            {step === "confirm" && "Введи код из письма. После этого откроется шаг с новым паролем."}
            {step === "reset" && "Новый пароль должен быть не короче 8 символов."}
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">
            {error}
          </div>
        ) : null}

        {message && step !== "done" ? (
          <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">
            {message}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton
          onClick={() => {
            void handleSubmit();
          }}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {busy
            ? "Обработка..."
            : step === "request"
              ? "Отправить код"
              : step === "confirm"
                ? "Подтвердить код"
                : step === "reset"
                  ? "Задать новый пароль"
                  : "Вернуться ко входу"}
        </PrimaryButton>

        {step === "confirm" ? (
          <button
            type="button"
            onClick={resetToRequest}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Изменить почту
          </button>
        ) : null}

        {step === "reset" ? (
          <button
            type="button"
            onClick={() => {
              setStep("confirm");
              setError(null);
              setMessage(null);
            }}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Назад к коду
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RecoveryField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "email" | "password";
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
      <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-accent/30 focus:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={placeholder}
      />
    </div>
  );
}
