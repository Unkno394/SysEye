"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Mail, UserRound } from "lucide-react";
import { AgentMetricsDashboard } from "@/components/agent-metrics-dashboard";
import { EmailConfirmationPanel } from "@/components/email-confirmation-panel";
import { GlassCard, PrimaryButton, SectionTitle, StatusBadge } from "@/components/ui";
import { apiFetch, apiJson } from "@/lib/api-client";
import type { AgentAnalyticsDto, AgentDto, AgentMetricsDto, PagedResult, Role, UserInfo } from "@/lib/backend-types";
import { getAgentStatus, getDistributionLabel, getRelativeHeartbeatLabel, getRoleLabel } from "@/lib/backend-types";
import { useClientRealtime } from "@/lib/client-realtime";
import { saveSessionProfile } from "@/lib/session-profile";
import { cn } from "@/lib/utils";

type PasswordMode = "old-password" | "email";
type RecoveryStep = "request" | "confirm" | "reset";

function formatPercent(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) {
    return "0%";
  }

  return `${Number(value).toFixed(1)}%`;
}

export default function SettingsPage() {
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentAnalyticsLoading, setAgentAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [analyticsExportBusy, setAnalyticsExportBusy] = useState<"Json" | "Csv" | "Pdf" | null>(null);
  const [analyticsExportMessage, setAnalyticsExportMessage] = useState<string | null>(null);
  const [analyticsExportOpen, setAnalyticsExportOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentDto[]>([]);
  const [agentAnalytics, setAgentAnalytics] = useState<AgentAnalyticsDto[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetricsDto | null>(null);
  const [selectedMetricsAgentId, setSelectedMetricsAgentId] = useState("");
  const [metricsAgentQuery, setMetricsAgentQuery] = useState("");
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
    void loadAgents();
    void loadAgentAnalytics();

    const intervalId = window.setInterval(() => {
      void loadAgents(true);
      void loadAgentAnalytics(true);
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useClientRealtime({
    onAgentUpdated: (updatedAgent) => {
      setAvailableAgents((current) => {
        const existingIndex = current.findIndex((agent) => agent.id === updatedAgent.id);
        if (existingIndex === -1) {
          return [updatedAgent, ...current].sort(
            (left, right) => new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime(),
          );
        }

        const nextAgents = [...current];
        nextAgents[existingIndex] = updatedAgent;
        nextAgents.sort((left, right) => new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime());
        return nextAgents;
      });
    },
    onAgentDeleted: ({ agentId }) => {
      setAvailableAgents((current) => current.filter((agent) => agent.id !== agentId));
    },
  });

  const fullName = useMemo(() => `${firstName} ${lastName}`.trim(), [firstName, lastName]);

  const loadAgents = async (background = false) => {
    if (!background) {
      setAgentsLoading(true);
    }

    try {
      const data = await apiJson<PagedResult<AgentDto>>("/api/hackaton/agent?take=100&skip=0", { method: "GET" }, "Не удалось загрузить список агентов.");
      const nextAgents = data.items ?? [];
      setAvailableAgents(nextAgents);

      setSelectedMetricsAgentId((current) => {
        if (current && nextAgents.some((agent) => agent.id === current)) {
          return current;
        }

        return nextAgents[0]?.id ?? "";
      });
    } catch (loadError) {
      setMetricsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить список агентов.");
    } finally {
      if (!background) {
        setAgentsLoading(false);
      }
    }
  };

  const filteredMetricsAgents = useMemo(() => {
    const normalizedQuery = metricsAgentQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return availableAgents;
    }

    return availableAgents.filter((agent) => {
      const searchText = [agent.name, getDistributionLabel(agent.distribution, agent.os), agent.ipAddress ?? ""]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [availableAgents, metricsAgentQuery]);

  const analyticsByAgentId = useMemo(
    () => new Map(agentAnalytics.map((item) => [item.agentId, item])),
    [agentAnalytics],
  );

  const selectedMetricsAgent = useMemo(
    () => availableAgents.find((agent) => agent.id === selectedMetricsAgentId) ?? null,
    [availableAgents, selectedMetricsAgentId],
  );
  const selectedMetricsAgentAnalytics = useMemo(
    () => analyticsByAgentId.get(selectedMetricsAgentId) ?? null,
    [analyticsByAgentId, selectedMetricsAgentId],
  );
  const selectedMetricsAgentStatus = selectedMetricsAgent ? getAgentStatus(selectedMetricsAgent.lastHeartbeatAt) : null;
  const selectedMetricsAgentMeta = selectedMetricsAgent
    ? [getDistributionLabel(selectedMetricsAgent.distribution, selectedMetricsAgent.os), selectedMetricsAgent.ipAddress || null].filter(Boolean).join(" · ")
    : null;

  const loadAgentAnalytics = async (background = false) => {
    if (!background) {
      setAgentAnalyticsLoading(true);
    }

    try {
      const data = await apiJson<AgentAnalyticsDto[]>(
        "/api/hackaton/analytics/agents",
        { method: "GET" },
        "Не удалось загрузить аналитику по агентам.",
      );
      setAgentAnalytics(data ?? []);
      setAnalyticsError(null);
    } catch (loadError) {
      setAgentAnalytics([]);
      setAnalyticsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить аналитику по агентам.");
    } finally {
      if (!background) {
        setAgentAnalyticsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedMetricsAgentId) {
      setAgentMetrics(null);
      return;
    }

    const loadMetrics = async () => {
      setMetricsLoading(true);
      setMetricsError(null);

      try {
        const data = await apiJson<AgentMetricsDto>(
          `/api/hackaton/analytics/agents/${selectedMetricsAgentId}/metrics`,
          { method: "GET" },
          "Не удалось загрузить метрики агента.",
        );
        setAgentMetrics(data);
      } catch (loadError) {
        setAgentMetrics(null);
        setMetricsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить метрики агента.");
      } finally {
        setMetricsLoading(false);
      }
    };

    void loadMetrics();
  }, [selectedMetricsAgentId]);

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
        "/api/hackaton/password/reset",
        {
          method: "POST",
          body: JSON.stringify({
            newPassword: recoveryPassword,
          }),
        },
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

  const handleAnalyticsExport = async (format: "Json" | "Csv" | "Pdf") => {
    setAnalyticsExportBusy(format);
    setAnalyticsExportOpen(false);
    setAnalyticsExportMessage(null);
    setAnalyticsError(null);

    try {
      const response = await apiFetch(`/api/hackaton/export?format=${encodeURIComponent(format)}`, { method: "GET" });

      if (!response.ok) {
        throw new Error(`Экспорт ${format} вернул ошибку ${response.status}.`);
      }

      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `analytics-export.${format.toLowerCase()}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(href);
      setAnalyticsExportMessage(`Файл аналитики в формате ${format} подготовлен.`);
    } catch (exportError) {
      setAnalyticsError(exportError instanceof Error ? exportError.message : "Не удалось выгрузить аналитику.");
    } finally {
      setAnalyticsExportBusy(null);
    }
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

      <section>
        <SectionTitle
          title="Состояние удалённых машин"
          subtitle="Реальные метрики по агентам: запуски, среднее время выполнения и ошибки за день."
        />

        <GlassCard className="mb-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xl font-semibold text-white">Экспорт аналитики</div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                Сохрани общую аналитику по агентам, задачам и метрикам в документ `Json`, `Csv` или `Pdf`.
              </p>
            </div>
            <PrimaryButton onClick={() => setAnalyticsExportOpen(true)} disabled={analyticsExportBusy !== null} className="min-w-[210px]">
              {analyticsExportBusy ? "Подготовка..." : "Выгрузить аналитику"}
            </PrimaryButton>
          </div>
        </GlassCard>

        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <GlassCard className="p-5">
            <div className="text-sm font-medium text-white">Выбор машины</div>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Выбери нужную машину и справа откроется её текущее состояние: платформа, heartbeat и доступность.
            </p>

            <input
              value={metricsAgentQuery}
              onChange={(event) => setMetricsAgentQuery(event.target.value)}
              placeholder="Поиск по имени или платформе"
              className="mt-5 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-accent/25"
            />

            <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {filteredMetricsAgents.map((agent) => {
                const status = getAgentStatus(agent.lastHeartbeatAt);
                const selected = agent.id === selectedMetricsAgentId;
                const machineMeta = [getDistributionLabel(agent.distribution, agent.os), agent.ipAddress || null].filter(Boolean).join(" · ");
                const machineAnalytics = analyticsByAgentId.get(agent.id);

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedMetricsAgentId(agent.id)}
                    className={`w-full rounded-[1.55rem] border p-4 text-left transition ${
                      selected
                        ? "border-accent/25 bg-accent/[0.08]"
                        : "border-white/8 bg-black/20 hover:border-white/15 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-white">{agent.name}</div>
                        <div className="mt-1 text-sm text-white/50">{machineMeta || "Параметры машины появятся позже."}</div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/40">
                          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
                            {machineAnalytics?.total?.executions ?? 0} запусков
                          </span>
                          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
                            {formatPercent(machineAnalytics?.total?.successRate)}
                          </span>
                          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
                            сегодня {machineAnalytics?.today?.executions ?? 0}
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                  </button>
                );
              })}

              {!filteredMetricsAgents.length ? (
                <div className="rounded-[1.55rem] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/40">
                  По запросу ничего не найдено.
                </div>
              ) : null}

              {!availableAgents.length && !agentsLoading ? (
                <div className="rounded-[1.55rem] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/40">
                  Агентов пока нет.
                </div>
              ) : null}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <SectionTitle
              title="Карточка агента"
              subtitle="Heartbeat, текущее состояние и агрегированные метрики выбранной машины."
            />

            {selectedMetricsAgent ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold text-white">{selectedMetricsAgent.name}</div>
                    <div className="mt-2 text-sm text-white/55">
                      {[getDistributionLabel(selectedMetricsAgent.distribution, selectedMetricsAgent.os), selectedMetricsAgent.ipAddress || null].filter(Boolean).join(" · ") || "Параметры машины появятся после первого подключения."}
                    </div>
                  </div>
                  {selectedMetricsAgentStatus ? <StatusBadge status={selectedMetricsAgentStatus} /> : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="text-sm text-white/50">Last heartbeat</div>
                    <div className="mt-2 text-lg font-medium text-white">{getRelativeHeartbeatLabel(selectedMetricsAgent.lastHeartbeatAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="text-sm text-white/50">Статус</div>
                    <div className="mt-2 text-lg font-medium text-white">{selectedMetricsAgentStatus === "online" ? "Подключён" : "Не подключён"}</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="text-sm text-white/50">Всего запусков</div>
                    <div className="mt-2 text-lg font-medium text-white">
                      {agentAnalyticsLoading && !selectedMetricsAgentAnalytics ? "..." : selectedMetricsAgentAnalytics?.total?.executions ?? 0}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="text-sm text-white/50">Успешность</div>
                    <div className="mt-2 text-lg font-medium text-white">
                      {agentAnalyticsLoading && !selectedMetricsAgentAnalytics ? "..." : formatPercent(selectedMetricsAgentAnalytics?.total?.successRate)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="text-sm text-white/50">Запусков сегодня</div>
                    <div className="mt-2 text-lg font-medium text-white">
                      {agentAnalyticsLoading && !selectedMetricsAgentAnalytics ? "..." : selectedMetricsAgentAnalytics?.today?.executions ?? 0}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="text-sm text-white/50">Ошибок сегодня</div>
                    <div className="mt-2 text-lg font-medium text-white">
                      {agentAnalyticsLoading && !selectedMetricsAgentAnalytics ? "..." : selectedMetricsAgentAnalytics?.today?.errors ?? 0}
                    </div>
                  </div>
                </div>

                <AgentMetricsDashboard
                  metrics={agentMetrics}
                  loading={metricsLoading}
                  agentName={selectedMetricsAgent.name}
                  agentMeta={selectedMetricsAgentMeta}
                  title="Метрики выбранного агента"
                  subtitle="Количество запусков, среднее время выполнения, ошибки за день и недельная динамика."
                  emptyMessage="Для этой машины ещё нет данных по выполнению задач."
                />
              </div>
            ) : (
              <div className="rounded-[1.55rem] border border-dashed border-white/10 px-4 py-12 text-center text-sm text-white/40">
                Выбери удалённую машину слева, чтобы увидеть её текущее состояние.
              </div>
            )}
          </GlassCard>
        </div>

        {(analyticsError || metricsError) ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">
            {[analyticsError, metricsError].filter(Boolean).join(" ")}
          </div>
        ) : null}

        {analyticsExportMessage ? (
          <div className="mt-4 rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">
            {analyticsExportMessage}
          </div>
        ) : null}
      </section>

      {analyticsExportOpen ? (
        <SettingsModal
          title="Выгрузка аналитики"
          subtitle="Выбери формат файла для экспорта общей аналитики по агентам, командам и задачам."
          onClose={() => setAnalyticsExportOpen(false)}
        >
          <div className="space-y-3">
            {(["Json", "Csv", "Pdf"] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => void handleAnalyticsExport(format)}
                disabled={analyticsExportBusy !== null}
                className="flex w-full items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-left text-white/80 transition hover:border-accent/25 hover:bg-accent/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-base font-medium text-white">{format}</span>
                <span className="text-sm text-white/45">{analyticsExportBusy === format ? "Подготовка..." : "Скачать"}</span>
              </button>
            ))}
          </div>
        </SettingsModal>
      ) : null}

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
