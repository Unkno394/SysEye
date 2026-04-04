"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { EmailConfirmationPanel } from "@/components/email-confirmation-panel";
import { getReadableApiError } from "@/lib/api-error";
import { saveSessionProfile } from "@/lib/session-profile";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);

  const resendConfirmation = async () => {
    const response = await fetch("/api/hackaton/emailconfirm", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Не удалось отправить письмо повторно.");
    }

    setMessage("Код подтверждения отправлен повторно. Проверь почту.");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPendingConfirmationEmail(null);
    setSubmitting(true);

    try {
      const loginResponse = await fetch("/api/hackaton/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login: email,
          password,
        }),
      });

      if (!loginResponse.ok) {
        throw new Error(await getReadableApiError(loginResponse, "Не удалось выполнить вход."));
      }

      const infoResponse = await fetch("/api/hackaton/user/info", {
        method: "GET",
        credentials: "include",
      });

      if (infoResponse.ok) {
        const user = await infoResponse.json();
        saveSessionProfile({
          email,
          name: typeof user?.name === "string" ? user.name : undefined,
        });
        if (user?.isEmailConfirmed === false) {
          await resendConfirmation();
          setPendingConfirmationEmail(
            typeof user?.email === "string" && user.email
              ? user.email
              : typeof user?.login === "string" && user.login
                ? user.login
                : email,
          );
          return;
        }
      }

      saveSessionProfile({ email });
      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось выполнить вход.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Вход в консоль"
      subtitle="Открой список агентов, историю задач и окно команд для удалённой диагностики машин."
    >
      <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit}>
        <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
          <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-accent/30 focus:bg-white/[0.06]"
            placeholder="you@example.com"
          />
        </div>
        <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
          <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-accent/70">Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-accent/30 focus:bg-white/[0.06]"
            placeholder="••••••••"
          />
        </div>
        <label className="flex items-center gap-3 rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/60 backdrop-blur-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent accent-[#58ffb3]"
          />
          Запомнить устройство
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-3 font-medium text-accent shadow-[0_0_32px_rgba(88,255,179,0.12)] transition hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Вход..." : "Перейти в панель"}
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
            initialMessage={message ?? "Регистрация ещё не завершена. Введи код из письма, чтобы активировать аккаунт."}
            successMessage="Почта подтверждена. Аккаунт активирован, теперь вход в панель доступен."
            onSuccess={() => {
              router.push("/dashboard");
              router.refresh();
            }}
          />
        ) : (
          <div className="rounded-[1.4rem] border border-accent/15 bg-accent/[0.08] px-4 py-4 text-sm leading-6 text-white/65 backdrop-blur-sm">
            {message ?? "Если почта не подтверждена, регистрация считается незавершённой. Запроси код на почту и введи его здесь."}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-white/55 sm:text-left">
        Нет аккаунта? <Link href="/register" className="text-accent transition hover:text-white">Создать</Link>
      </div>
    </AuthShell>
  );
}
