"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { EmailConfirmationPanel } from "@/components/email-confirmation-panel";
import { getReadableApiError } from "@/lib/api-error";
import { saveSessionProfile } from "@/lib/session-profile";

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPendingConfirmationEmail(null);

    if (password !== passwordRepeat) {
      setError("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);

    try {
      const registerResponse = await fetch("/api/hackaton/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          login: email,
          password,
          email,
        }),
      });

      if (!registerResponse.ok) {
        throw new Error(await getReadableApiError(registerResponse, "Не удалось зарегистрировать аккаунт."));
      }

      const loginResponse = await fetch("/api/hackaton/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login: email,
          password,
        }),
        credentials: "include",
      });

      if (!loginResponse.ok) {
        throw new Error(await getReadableApiError(loginResponse, "Аккаунт создан, но не удалось автоматически выполнить вход для отправки письма."));
      }

      saveSessionProfile({
        email,
        name: `${firstName} ${lastName}`.trim(),
      });

      const confirmResponse = await fetch("/api/hackaton/emailconfirm", {
        method: "GET",
        credentials: "include",
      });

      if (!confirmResponse.ok) {
        setMessage("Регистрация начата, но не завершена. Если код не ушёл автоматически, попробуй отправить его повторно.");
        setPendingConfirmationEmail(email);
        return;
      }

      setPendingConfirmationEmail(email);
      setMessage("Регистрация почти завершена. Мы отправили код подтверждения на почту.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось завершить регистрацию.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Создание аккаунта"
      subtitle="Создай аккаунт и открой рабочее пространство."
    >
      <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit}>
        <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Имя</label>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-accent/30 focus:bg-white/[0.06]"
                placeholder="Dmitry"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Фамилия</label>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-accent/30 focus:bg-white/[0.06]"
                placeholder="Prudnikov"
              />
            </div>
          </div>
        </div>
        <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
          <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-accent/30 focus:bg-white/[0.06]"
            placeholder="you@example.com"
          />
        </div>
        <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-accent/30 focus:bg-white/[0.06]"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Повтор пароля</label>
              <input
                type="password"
                value={passwordRepeat}
                onChange={(event) => setPasswordRepeat(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-accent/30 focus:bg-white/[0.06]"
                placeholder="••••••••"
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 font-medium text-accent shadow-[0_0_32px_rgba(88,255,179,0.12)] transition hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Создание..." : "Создать рабочее пространство"}
        </button>
      </form>

      {error ? (
        <div className="mt-6 rounded-[1.4rem] border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm leading-6 text-rose-100/90 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        {pendingConfirmationEmail ? (
          <EmailConfirmationPanel
            email={pendingConfirmationEmail}
            initialMessage={message ?? "Регистрация почти завершена. Введи код из письма, чтобы подтвердить почту и активировать аккаунт."}
            successMessage="Почта подтверждена. Открываем панель."
            onSuccess={() => {
              router.push("/dashboard");
              router.refresh();
            }}
          />
        ) : (
          <div className="rounded-[1.4rem] border border-accent/15 bg-accent/[0.08] px-4 py-4 text-sm leading-6 text-white/65 backdrop-blur-sm">
            {message ?? "После отправки формы регистрация ещё не завершена. На email придёт код подтверждения, и только после его ввода аккаунт станет активным."}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-xs text-white/50 backdrop-blur-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60"></span>
          Доступ к панели
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60"></span>
          Подключение агентов
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60"></span>
          Сценарии проверок
        </span>
      </div>

      <div className="mt-4 text-center text-sm text-white/55">
        Уже есть аккаунт? <Link href="/login" className="text-accent transition hover:text-white">Войти</Link>
      </div>
    </AuthShell>
  );
}
