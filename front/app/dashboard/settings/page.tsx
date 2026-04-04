"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Mail, UserRound } from "lucide-react";
import { EmailConfirmationPanel } from "@/components/email-confirmation-panel";
import { GlassCard, PrimaryButton, SectionTitle } from "@/components/ui";
import { apiJson } from "@/lib/api-client";
import type { Role, UserInfo } from "@/lib/backend-types";
import { getRoleLabel } from "@/lib/backend-types";
import { saveSessionProfile } from "@/lib/session-profile";
import { cn } from "@/lib/utils";

type PasswordMode = "old-password" | "email";
type RecoveryStep = "request" | "confirm" | "reset";

export default function SettingsPage() {
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [isEmailConfirmed, setIsEmailConfirmed] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [confirmEmailModalOpen, setConfirmEmailModalOpen] = useState(false);
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("old-password");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("request");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryRepeatPassword, setRecoveryRepeatPassword] = useState("");
  const [passwordFlowMessage, setPasswordFlowMessage] = useState<string | null>(null);
  const [passwordFlowError, setPasswordFlowError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  const loadProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const user = await apiJson<UserInfo>("/api/hackaton/user/info", { method: "GET" }, "Не удалось загрузить профиль.");
      const [loadedFirstName = "", ...rest] = (user.name || "").trim().split(/\s+/);

      setFirstName(loadedFirstName);
      setLastName(rest.join(" "));
      setEmail(user.email || "");
      setLogin(user.login || "");
      setRecoveryEmail(user.email || "");
      setRole(user.role);
      setIsEmailConfirmed(Boolean(user.isEmailConfirmed));
      saveSessionProfile({
        email: user.email || user.login || "",
        name: user.name || "",
      });
    } catch (loadError) {
      setProfileError(loadError instanceof Error ? loadError.message : "Не удалось загрузить профиль.");
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const fullName = useMemo(() => `${firstName} ${lastName}`.trim(), [firstName, lastName]);

  const handleProfileSave = async () => {
    setProfileError(null);
    setProfileMessage(null);

    try {
      await apiJson<void>(
        `/api/hackaton/user/rename?name=${encodeURIComponent(fullName)}`,
        { method: "GET" },
        "Не удалось сохранить имя пользователя.",
      );

      saveSessionProfile({ name: fullName, email });
      setProfileMessage("Профиль обновлён.");
      await loadProfile();
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Не удалось сохранить профиль.");
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordBusy(true);
    setPasswordFlowError(null);
    setPasswordFlowMessage(null);

    try {
      if (passwordMode === "old-password") {
        if (newPassword !== repeatNewPassword) {
          throw new Error("Новый пароль и подтверждение не совпадают.");
        }

        await apiJson<void>(
          "/api/hackaton/password/change",
          {
            method: "POST",
            body: JSON.stringify({
              oldPassword,
              newPassword,
            }),
          },
          "Не удалось сменить пароль.",
        );

        setPasswordFlowMessage("Пароль успешно изменён.");
        setOldPassword("");
        setNewPassword("");
        setRepeatNewPassword("");
        return;
      }

      if (recoveryStep === "request") {
        await apiJson<void>(
          `/api/hackaton/password/recovery/email?email=${encodeURIComponent(recoveryEmail)}`,
          { method: "GET" },
          "Не удалось отправить код для сброса.",
        );

        setRecoveryStep("confirm");
        setPasswordFlowMessage("Код отправлен на почту. Введи его для подтверждения.");
        return;
      }

      if (recoveryStep === "confirm") {
        await apiJson<void>(
          "/api/hackaton/password/recovery/validate",
          {
            method: "POST",
            body: JSON.stringify({
              email: recoveryEmail,
              token: recoveryToken,
            }),
          },
          "Не удалось подтвердить код сброса.",
        );

        setRecoveryStep("reset");
        setPasswordFlowMessage("Код подтверждён. Теперь можно задать новый пароль.");
        return;
      }

      if (recoveryPassword !== recoveryRepeatPassword) {
        throw new Error("Новый пароль и подтверждение не совпадают.");
      }

      await apiJson<void>(
        `/api/hackaton/password/reset?password=${encodeURIComponent(recoveryPassword)}`,
        { method: "POST" },
        "Не удалось задать новый пароль.",
      );

      setPasswordFlowMessage("Пароль успешно сброшен.");
      setRecoveryStep("request");
      setRecoveryToken("");
      setRecoveryPassword("");
      setRecoveryRepeatPassword("");
    } catch (passwordError) {
      setPasswordFlowError(passwordError instanceof Error ? passwordError.message : "Не удалось выполнить действие.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleEmailSubmit = () => {
    setProfileError("Смена почты пока недоступна.");
  };

  return (
    <div className="space-y-6 pb-10">
      <GlassCard className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Settings</h1>
            <p className="mt-2 max-w-3xl text-white/55">
              Здесь живут профиль пользователя, подтверждение почты и смена пароля. Всё, что связано с командами, перенесено во вкладку Commands.
            </p>
          </div>
        </div>
      </GlassCard>

      <div>
        <GlassCard className="p-6">
          <SectionTitle title="Профиль" subtitle="Имя, почта и основные данные аккаунта." />
          <div className="space-y-4">
            <SettingsField label="Имя" icon={<UserRound size={16} className="text-accent" />} value={firstName} onChange={setFirstName} placeholder="Имя" disabled={profileLoading} />
            <SettingsField label="Фамилия" icon={<UserRound size={16} className="text-accent" />} value={lastName} onChange={setLastName} placeholder="Фамилия" disabled={profileLoading} />
            <SettingsField label="Email" icon={<Mail size={16} className="text-accent" />} value={email} onChange={setEmail} placeholder="you@example.com" disabled />
            <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-white/60">
              <div>Логин: <span className="text-white">{login || "не указан"}</span></div>
              <div className="mt-2">Роль: <span className="text-white">{getRoleLabel(role)}</span></div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <PrimaryButton onClick={handleProfileSave} disabled={profileLoading || !fullName} className="w-full sm:w-auto">Сохранить профиль</PrimaryButton>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(true)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.07] hover:text-white sm:w-auto"
              >
                Сменить пароль
              </button>
              <button
                type="button"
                onClick={() => setEmailModalOpen(true)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.07] hover:text-white sm:w-auto"
              >
                Сменить почту
              </button>
            </div>

            {!isEmailConfirmed ? (
              <button
                type="button"
                onClick={() => setConfirmEmailModalOpen(true)}
                className="w-full rounded-2xl border border-accent/20 bg-accent/[0.08] px-4 py-3 text-sm text-accent transition hover:bg-accent/[0.12] sm:w-auto"
              >
                Подтвердить почту
              </button>
            ) : (
              <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">
                Почта подтверждена
              </div>
            )}

            {profileError ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{profileError}</div> : null}
            {profileMessage ? <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">{profileMessage}</div> : null}
          </div>
        </GlassCard>
      </div>

      {passwordModalOpen ? (
        <SettingsModal
          title="Смена пароля"
          subtitle="Выбери, как хочешь изменить пароль."
          onClose={() => setPasswordModalOpen(false)}
        >
          <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setPasswordMode("old-password")}
              className={cn(
                "rounded-xl px-4 py-2.5 text-sm transition",
                passwordMode === "old-password" ? "bg-accent/12 text-accent" : "text-white/65 hover:text-white",
              )}
            >
              Через старый пароль
            </button>
            <button
              type="button"
              onClick={() => setPasswordMode("email")}
              className={cn(
                "rounded-xl px-4 py-2.5 text-sm transition",
                passwordMode === "email" ? "bg-accent/12 text-accent" : "text-white/65 hover:text-white",
              )}
            >
              Через почту
            </button>
          </div>

          {passwordMode === "old-password" ? (
            <div className="mt-4 space-y-4">
              <SettingsField label="Старый пароль" value={oldPassword} onChange={setOldPassword} placeholder="••••••••" type="password" />
              <SettingsField label="Новый пароль" value={newPassword} onChange={setNewPassword} placeholder="••••••••" type="password" />
              <SettingsField label="Повтор нового пароля" value={repeatNewPassword} onChange={setRepeatNewPassword} placeholder="••••••••" type="password" />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {recoveryStep === "request" ? (
                <SettingsField label="Почта для сброса" value={recoveryEmail} onChange={setRecoveryEmail} placeholder="you@example.com" type="email" />
              ) : null}

              {recoveryStep === "confirm" ? (
                <SettingsField label="Код из письма" value={recoveryToken} onChange={setRecoveryToken} placeholder="1234" />
              ) : null}

              {recoveryStep === "reset" ? (
                <>
                  <SettingsField label="Новый пароль" value={recoveryPassword} onChange={setRecoveryPassword} placeholder="••••••••" type="password" />
                  <SettingsField label="Повтор нового пароля" value={recoveryRepeatPassword} onChange={setRecoveryRepeatPassword} placeholder="••••••••" type="password" />
                </>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
                {recoveryStep === "request" && "Сначала отправим код на подтверждённую почту."}
                {recoveryStep === "confirm" && "После подтверждения кода можно будет задать новый пароль."}
                {recoveryStep === "reset" && "Финальный шаг: задай новый пароль для аккаунта."}
              </div>
            </div>
          )}

          {passwordFlowError ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{passwordFlowError}</div> : null}
          {passwordFlowMessage ? <div className="mt-4 rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">{passwordFlowMessage}</div> : null}

          <div className="mt-6 flex gap-3">
            <PrimaryButton onClick={handlePasswordSubmit} disabled={passwordBusy}>
              {passwordBusy ? "Обработка..." : passwordMode === "old-password"
                ? "Сменить пароль"
                : recoveryStep === "request"
                  ? "Отправить код"
                  : recoveryStep === "confirm"
                    ? "Подтвердить код"
                    : "Задать новый пароль"}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(false)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
            >
              Отмена
            </button>
          </div>
        </SettingsModal>
      ) : null}

      {emailModalOpen ? (
        <SettingsModal
          title="Смена почты"
          subtitle="Эта возможность появится позже."
          onClose={() => setEmailModalOpen(false)}
        >
          <div className="space-y-4">
            <SettingsField label="Новая почта" value={newEmail} onChange={setNewEmail} placeholder="new@example.com" type="email" />
            <SettingsField label="Текущий пароль" value={emailPassword} onChange={setEmailPassword} placeholder="••••••••" type="password" />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
            Сейчас почту изменить нельзя. Эта настройка появится позже.
          </div>

          <div className="mt-6 flex gap-3">
            <PrimaryButton onClick={handleEmailSubmit}>Понятно</PrimaryButton>
            <button
              type="button"
              onClick={() => setEmailModalOpen(false)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
            >
              Отмена
            </button>
          </div>
        </SettingsModal>
      ) : null}

      {confirmEmailModalOpen ? (
        <SettingsModal
          title="Подтверждение почты"
          subtitle="Код подтверждения придёт на почту."
          onClose={() => setConfirmEmailModalOpen(false)}
        >
          <EmailConfirmationPanel
            email={email}
            initialMessage="Если код ещё не пришёл, отправь его повторно и затем введи ниже."
            successMessage="Почта подтверждена. Аккаунт полностью активен."
            onSuccess={() => {
              setIsEmailConfirmed(true);
              setProfileMessage("Почта подтверждена.");
              setConfirmEmailModalOpen(false);
            }}
          />
        </SettingsModal>
      ) : null}
    </div>
  );
}

function SettingsModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
      <div className="w-full max-w-xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
          >
            Закрыть
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
      </div>
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-3.5 sm:p-4">
      <label className="mb-2 flex items-center gap-2 text-sm text-white/60">
        {icon}
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25 disabled:opacity-60"
      />
    </div>
  );
}
