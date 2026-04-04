"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, PencilLine, RefreshCw, Trash2 } from "lucide-react";
import { GlassCard, PrimaryButton, StatusBadge } from "@/components/ui";
import { TerminalPanel } from "@/components/terminal-panel";
import { apiJson } from "@/lib/api-client";
import { loadAllCommands } from "@/lib/commands";
import {
  buildAgentReconnectUrl,
  buildLinuxServiceGenerateCommand,
  buildReconnectCommand,
  getDefaultAgentServerUrl,
  getCliInstallCommand,
  getLinuxServiceEnableCommand,
  inferAgentServerUrl,
} from "@/lib/agent-launch";
import type { AgentConnectionTokenDto, AgentDto, CommandDto } from "@/lib/backend-types";
import { getAgentStatus, getDistributionKey, getOsLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";

export default function AgentDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params.id;

  const [agent, setAgent] = useState<AgentDto | null>(null);
  const [commands, setCommands] = useState<CommandDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [agentServerUrl, setAgentServerUrl] = useState(getDefaultAgentServerUrl());
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [reconnectToken, setReconnectToken] = useState<string | null>(null);
  const [reconnectCommandCopied, setReconnectCommandCopied] = useState(false);
  const [reconnectPlatform, setReconnectPlatform] = useState<"linux" | "windows">("windows");

  const loadData = async (background = false) => {
    if (!background) {
      setLoading(true);
    }

    setError(null);

    try {
      const loadedAgent = await apiJson<AgentDto>(
        `/api/hackaton/agent/${agentId}`,
        { method: "GET" },
        "Не удалось загрузить агента.",
      );
      setAgent(loadedAgent);
      setEditName(loadedAgent.name);

      try {
        setCommands(await loadAllCommands("Не удалось загрузить команды."));
      } catch {
        setCommands([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные агента.");
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!agentId) return undefined;

    void loadData();

    const intervalId = window.setInterval(() => {
      void loadData(true);
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agentId]);

  useEffect(() => {
    setAgentServerUrl(inferAgentServerUrl());
  }, []);

  const status = useMemo(() => (agent ? getAgentStatus(agent.lastHeartbeatAt) : "offline"), [agent]);
  const reconnectCommand = useMemo(() => {
    if (!reconnectToken) return "";
    return buildReconnectCommand(agentServerUrl, reconnectToken, agent?.os);
  }, [agent?.os, agentServerUrl, reconnectToken]);
  const reconnectUrl = useMemo(() => {
    if (!reconnectToken) return "";
    return buildAgentReconnectUrl(agentServerUrl, reconnectToken);
  }, [agentServerUrl, reconnectToken]);
  const preferredReconnectPlatform = useMemo<"linux" | "windows">(() => {
    if (!agent) return "windows";

    const distributionKey = getDistributionKey(agent.distribution, agent.os);
    if (distributionKey !== "windows" && distributionKey !== "macos" && distributionKey !== "unknown") {
      return "linux";
    }

    return agent.os === 1 ? "linux" : "windows";
  }, [agent]);
  const linuxCliInstallCommand = getCliInstallCommand();
  const linuxServiceEnableCommand = getLinuxServiceEnableCommand();
  const linuxServiceGenerateCommand = useMemo(() => {
    if (!reconnectToken) return "";
    return buildLinuxServiceGenerateCommand(agentServerUrl, reconnectToken);
  }, [agentServerUrl, reconnectToken]);

  const handleSave = async () => {
    if (!agent) return;
    setEditing(true);
    setError(null);

    try {
      await apiJson<void>(
        `/api/hackaton/agent/${agent.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: editName,
          }),
        },
        "Не удалось обновить агента.",
      );

      setEditOpen(false);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить агента.");
    } finally {
      setEditing(false);
    }
  };

  const handleHeartbeat = async () => {
    if (!agent) return;
    setHeartbeatLoading(true);
    setError(null);

    try {
      await apiJson(
        `/api/hackaton/agent/${agent.id}/heartbeat`,
        { method: "POST" },
        "Не удалось обновить heartbeat.",
      );
      await loadData();
    } catch (heartbeatError) {
      setError(heartbeatError instanceof Error ? heartbeatError.message : "Не удалось обновить heartbeat.");
    } finally {
      setHeartbeatLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    setDeleteLoading(true);
    setError(null);

    try {
      await apiJson(`/api/hackaton/agent/${agent.id}`, { method: "DELETE" }, "Не удалось удалить агента.");
      router.push("/dashboard");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (!agent) return;
    setReconnectLoading(true);
    setReconnectCommandCopied(false);
    setError(null);

    try {
      const connection = await apiJson<AgentConnectionTokenDto>(
        `/api/hackaton/agent/${agent.id}/connection-token`,
        { method: "GET" },
        "Не удалось получить токен переподключения.",
      );

      setReconnectToken(connection.token);
      window.location.assign(buildAgentReconnectUrl(agentServerUrl, connection.token));
      window.setTimeout(() => {
        void loadData(true);
      }, 4_000);
      window.setTimeout(() => {
        void loadData(true);
      }, 9_000);
    } catch (reconnectError) {
      setError(reconnectError instanceof Error ? reconnectError.message : "Не удалось переподключить агента.");
    } finally {
      setReconnectLoading(false);
    }
  };

  const handleStatusAction = async () => {
    if (status === "offline") {
      await handleReconnect();
      return;
    }

    await handleHeartbeat();
  };

  const handleOpenReconnectHelp = async () => {
    if (!agent) return;
    setHelpLoading(true);
    setReconnectCommandCopied(false);
    setError(null);

    try {
      const connection = await apiJson<AgentConnectionTokenDto>(
        `/api/hackaton/agent/${agent.id}/connection-token`,
        { method: "GET" },
        "Не удалось получить инструкцию переподключения.",
      );

      setReconnectToken(connection.token);
      setReconnectPlatform(preferredReconnectPlatform);
      setReconnectOpen(true);
    } catch (instructionError) {
      setError(instructionError instanceof Error ? instructionError.message : "Не удалось открыть инструкцию переподключения.");
    } finally {
      setHelpLoading(false);
    }
  };

  const handleCopyReconnectCommand = async () => {
    if (!reconnectCommand) return;

    try {
      await navigator.clipboard.writeText(reconnectCommand);
      setReconnectCommandCopied(true);
    } catch {
      setReconnectCommandCopied(false);
      setError("Не удалось скопировать команду переподключения.");
    }
  };

  if (loading) {
    return <GlassCard className="p-8 text-center text-white/55">Загрузка агента...</GlassCard>;
  }

  if (error && !agent) {
    return <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-8 text-center text-rose-100/90">{error}</GlassCard>;
  }

  if (!agent) {
    return <GlassCard className="p-8 text-center text-white/55">Агент не найден.</GlassCard>;
  }

  const machineDetails = [getOsLabel(agent.os), agent.ipAddress || null].filter(Boolean).join(" · ");
  const statusActionLabel = reconnectLoading
    ? "Запуск..."
    : heartbeatLoading
      ? "Проверка..."
      : status === "offline"
        ? "Проверить и подключить"
        : "Проверить статус";

  return (
    <div className="space-y-6 pb-10">
      <GlassCard className="p-6 sm:p-8">
        <div className="space-y-6">
          <div className="min-w-0">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-accent">
              <ChevronLeft size={16} /> Back to agents
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="break-words text-3xl font-semibold text-white">{agent.name}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="mt-2 text-white/55">{machineDetails || "Параметры машины появятся позже."}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
              Здесь можно обновить данные агента, удалить запись, проверить реальный статус подключения и запускать сохранённые команды.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition hover:bg-white/10 sm:w-auto"
              >
                <PencilLine size={16} />
                Редактировать
              </button>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => void handleStatusAction()}
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent transition hover:bg-accent/15 sm:flex-none"
                >
                  <RefreshCw size={16} className={heartbeatLoading || reconnectLoading ? "animate-spin" : ""} />
                  <span>{statusActionLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenReconnectHelp()}
                  disabled={helpLoading}
                  aria-label="Инструкция по переподключению"
                  title="Инструкция по переподключению"
                  className="inline-flex h-[50px] w-[50px] items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {helpLoading ? "..." : "?"}
                </button>
              </div>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-400/15 sm:w-auto"
              >
                <Trash2 size={16} />
                {deleteLoading ? "Удаление..." : "Удалить"}
              </button>
            </div>
            {status === "offline" ? (
              <p className="mt-4 max-w-2xl text-sm leading-6 text-amber-200/80">
                Агент сейчас оффлайн. Новые команды останутся в очереди, пока машина не пришлёт реальный heartbeat.
              </p>
            ) : null}
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Статус агента</div>
          <div className="mt-3">
            <StatusBadge status={status} />
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Last heartbeat</div>
          <div className="mt-3 text-2xl font-semibold text-white">{getRelativeHeartbeatLabel(agent.lastHeartbeatAt)}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Команд доступно</div>
          <div className="mt-3 text-2xl font-semibold text-white">{commands.length}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Параметры машины</div>
          <div className="mt-3 text-lg font-semibold text-white">{machineDetails || "Пока нет данных"}</div>
        </GlassCard>
      </div>

      {error ? (
        <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100/90">{error}</GlassCard>
      ) : null}
      <TerminalPanel agent={agent} commands={commands} />

      {reconnectPlatform === "linux" && reconnectOpen && reconnectToken ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
            <div className="w-full max-w-2xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-white">Переподключение Linux-агента</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    Здесь собраны команды для Linux: установить CLI, пересоздать `systemd --user` сервис и при необходимости
                    разово поднять агента в фоне.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReconnectOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReconnectPlatform("linux")}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      reconnectPlatform === "linux" ? "bg-accent/20 text-accent" : "text-white/55 hover:text-white"
                    }`}
                  >
                    Linux
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconnectPlatform("windows")}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      reconnectPlatform === "windows" ? "bg-accent/20 text-accent" : "text-white/55 hover:text-white"
                    }`}
                  >
                    Windows
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReconnectPlatform("linux")}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      reconnectPlatform === "linux" ? "bg-accent/20 text-accent" : "text-white/55 hover:text-white"
                    }`}
                  >
                    Linux
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconnectPlatform("windows")}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      reconnectPlatform === "windows" ? "bg-accent/20 text-accent" : "text-white/55 hover:text-white"
                    }`}
                  >
                    Windows
                  </button>
                </div>
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-4 text-sm text-sky-100/90">
                  Коротко: сначала пересоздай user-service, потом включи его. Если сервис не нужен, используй fallback-команду.
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">Шаг 1. Установить CLI</div>
                    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                      {linuxCliInstallCommand}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">Шаг 2. Создать user-service</div>
                    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                      mkdir -p ~/.config/systemd/user
                    </div>
                    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                      {linuxServiceGenerateCommand}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">Шаг 3. Включить и запустить</div>
                    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                      {linuxServiceEnableCommand}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">Fallback command</div>
                    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                      {reconnectCommand}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCopyReconnectCommand}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                >
                  {reconnectCommandCopied ? "Скопировано" : "Скопировать fallback-команду"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reconnectPlatform === "windows" && reconnectOpen && reconnectToken ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
            <div className="w-full max-w-2xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-white">Переподключение агента</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    Если агент слетел после перезагрузки, нажми основную кнопку рядом. Если браузер спросит про запуск
                    <code> syseye-agent:// </code>, подтверди. Если ничего не произошло, используй команду ниже.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReconnectOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-4 text-sm text-sky-100/90">
                  Коротко: одна кнопка проверяет статус, а если агент оффлайн, сразу пытается поднять его заново.
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/40">Fallback command</div>
                  <div className="mt-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                    {reconnectCommand}
                  </div>
                  <div className="mt-3 text-xs text-white/45">
                    Эта команда поднимет локальный агент в фоне и использует свежий токен подключения для выбранной машины.
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href={reconnectUrl}
                  className="inline-flex items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
                >
                  Открыть ссылку ещё раз
                </a>
                <button
                  type="button"
                  onClick={handleCopyReconnectCommand}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                >
                  {reconnectCommandCopied ? "Скопировано" : "Скопировать команду"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
            <div className="w-full max-w-xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-white">Редактирование агента</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">Здесь можно изменить имя машины.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <Field label="Имя машины" value={editName} onChange={setEditName} placeholder="Имя машины" />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton onClick={handleSave} disabled={editing || !editName.trim()}>
                  {editing ? "Сохранение..." : "Сохранить"}
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-white/60">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25"
      />
    </div>
  );
}
