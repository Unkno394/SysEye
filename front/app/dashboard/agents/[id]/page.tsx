"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, PencilLine, RefreshCw, Trash2 } from "lucide-react";
import { GlassCard, PrimaryButton, StatusBadge } from "@/components/ui";
import { TerminalPanel } from "@/components/terminal-panel";
import { apiFetch, apiJson } from "@/lib/api-client";
import { removeAgentFromGroups } from "@/lib/agent-groups";
import { loadAllCommands } from "@/lib/commands";
import {
  type AgentLaunchPlatform,
  buildAgentReconnectUrl,
  buildLinuxServiceGenerateCommand,
  buildReconnectCommand,
  getDefaultAgentServerUrl,
  getCliInstallCommand,
  getOsTypeForPlatform,
  getLinuxServiceEnableCommand,
  inferLocalAgentPlatform,
  inferAgentServerUrl,
} from "@/lib/agent-launch";
import type { AgentConnectionTokenDto, AgentDto, CommandDto } from "@/lib/backend-types";
import { getDistributionKey, getOsLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { useClientRealtime } from "@/lib/client-realtime";
import { applyEffectiveAgentMetadata, getEffectiveAgentStatus, markAgentLaunched, useLocalAgentHeartbeats, useLocalAgentLaunches } from "@/lib/local-agent-runtime";

export default function AgentDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params?.id ?? "";

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
  const [exportBusy, setExportBusy] = useState<"Json" | "Csv" | "Pdf" | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportOverlayOpen, setExportOverlayOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [agentServerUrl, setAgentServerUrl] = useState(getDefaultAgentServerUrl());
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [reconnectToken, setReconnectToken] = useState<string | null>(null);
  const [reconnectCommandCopied, setReconnectCommandCopied] = useState(false);
  const [reconnectPlatform, setReconnectPlatform] = useState<AgentLaunchPlatform>(inferLocalAgentPlatform);
  const localLaunches = useLocalAgentLaunches();

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
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agentId]);

  useEffect(() => {
    setAgentServerUrl(inferAgentServerUrl());
  }, []);

  useClientRealtime(
    {
      onAgentUpdated: (updatedAgent) => {
        if (updatedAgent.id !== agentId) {
          return;
        }

        setAgent(updatedAgent);
      },
      onAgentDeleted: ({ agentId: deletedAgentId }) => {
        if (deletedAgentId !== agentId) {
          return;
        }

        removeAgentFromGroups(deletedAgentId);
        router.push("/dashboard");
        router.refresh();
      },
    },
    Boolean(agentId),
  );

  useLocalAgentHeartbeats(agent && localLaunches[agent.id] ? [agent.id] : []);

  const effectiveAgent = useMemo(() => (agent ? applyEffectiveAgentMetadata(agent, localLaunches) : null), [agent, localLaunches]);
  const status = useMemo(() => (agent ? getEffectiveAgentStatus(agent, localLaunches) : "offline"), [agent, localLaunches]);
  const reconnectCommand = useMemo(() => {
    if (!reconnectToken) return "";
    return buildReconnectCommand(agentServerUrl, reconnectToken, effectiveAgent?.os);
  }, [effectiveAgent?.os, agentServerUrl, reconnectToken]);
  const reconnectUrl = useMemo(() => {
    if (!reconnectToken) return "";
    return buildAgentReconnectUrl(agentServerUrl, reconnectToken);
  }, [agentServerUrl, reconnectToken]);
  const preferredReconnectPlatform = useMemo<"linux" | "windows">(() => {
    if (!effectiveAgent) return "windows";

    const distributionKey = getDistributionKey(effectiveAgent.distribution, effectiveAgent.os);
    if (distributionKey !== "windows" && distributionKey !== "macos" && distributionKey !== "unknown") {
      return "linux";
    }

    return effectiveAgent.os === 1 ? "linux" : "windows";
  }, [effectiveAgent]);
  const linuxCliInstallCommand = getCliInstallCommand();
  const linuxServiceEnableCommand = getLinuxServiceEnableCommand();
  const linuxServiceGenerateCommand = useMemo(() => {
    if (!reconnectToken) return "";
    return buildLinuxServiceGenerateCommand(agentServerUrl, reconnectToken);
  }, [agentServerUrl, reconnectToken]);
  const showLinuxReconnectHelp = Boolean(reconnectOpen && reconnectToken && reconnectPlatform === "linux");
  const showWindowsReconnectHelp = Boolean(reconnectOpen && reconnectToken && reconnectPlatform === "windows");

  const ensureAgentOs = async (platform: AgentLaunchPlatform) => {
    if (!agent || agent.os != null) {
      return;
    }

    try {
      await apiJson<void>(
        `/api/hackaton/agent/${agent.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            os: getOsTypeForPlatform(platform),
          }),
        },
        "Не удалось обновить платформу агента.",
      );
    } catch {
      return;
    }
  };

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
    if (!window.confirm(`Удалить агента "${agent.name}"?`)) {
      return;
    }

    setDeleteLoading(true);
    setError(null);

    try {
      await apiJson(`/api/hackaton/agent/${agent.id}`, { method: "DELETE" }, "Не удалось удалить агента.");
      removeAgentFromGroups(agent.id);
      router.push("/dashboard");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExport = async (format: "Json" | "Csv" | "Pdf") => {
    if (!agent) return;

    setExportBusy(format);
    setExportOverlayOpen(false);
    setExportMessage(null);
    setError(null);

    try {
      const query = new URLSearchParams({
        format,
        agentId: agent.id,
      });
      const response = await apiFetch(`/api/hackaton/export?${query.toString()}`, { method: "GET" });

      if (!response.ok) {
        throw new Error(`Экспорт ${format} вернул ошибку ${response.status}.`);
      }

      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extension = format.toLowerCase();
      anchor.href = href;
      anchor.download = `${agent.name || "agent"}-export.${extension}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(href);
      setExportMessage(`Экспорт ${format} подготовлен для агента ${agent.name}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Не удалось выполнить экспорт.");
    } finally {
      setExportBusy(null);
    }
  };

  const handleReconnect = async () => {
    if (!agent) return;
    setReconnectLoading(true);
    setReconnectCommandCopied(false);
    setError(null);

    try {
      await ensureAgentOs(inferLocalAgentPlatform());

      const connection = await apiJson<AgentConnectionTokenDto>(
        `/api/hackaton/agent/${agent.id}/connection-token`,
        { method: "GET" },
        "Не удалось получить токен переподключения.",
      );

      setReconnectToken(connection.token);
      markAgentLaunched(agent.id, inferLocalAgentPlatform());
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
      const platform = effectiveAgent?.os === 1 ? "linux" : effectiveAgent?.os === 2 ? "windows" : inferLocalAgentPlatform();
      await ensureAgentOs(platform);

      const connection = await apiJson<AgentConnectionTokenDto>(
        `/api/hackaton/agent/${agent.id}/connection-token`,
        { method: "GET" },
        "Не удалось получить инструкцию переподключения.",
      );

      setReconnectToken(connection.token);
      setReconnectPlatform(platform);
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

  if (!agent || !effectiveAgent) {
    return <GlassCard className="p-8 text-center text-white/55">Агент не найден.</GlassCard>;
  }

  const machineDetails = [getOsLabel(effectiveAgent.os), effectiveAgent.ipAddress || null].filter(Boolean).join(" · ");
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
                disabled={deleteLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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

      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Экспорт по агенту</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Экспорт логов, задач и аналитики в контексте этой машины. Формат выбирается в отдельном overlay.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={() => setExportOverlayOpen(true)} disabled={exportBusy !== null} className="min-w-[170px]">
              {exportBusy ? "Подготовка..." : "Экспорт логов"}
            </PrimaryButton>
          </div>
        </div>
        {exportMessage ? (
          <div className="mt-4 rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">{exportMessage}</div>
        ) : null}
      </GlassCard>

      {error ? (
        <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100/90">{error}</GlassCard>
      ) : null}
      <TerminalPanel agent={effectiveAgent} commands={commands} status={status} />

      {exportOverlayOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-center justify-center py-3">
            <div className="w-full max-w-md rounded-[1.8rem] border border-white/10 bg-[#101821]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">Экспорт логов</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    Выбери формат выгрузки для агента <span className="text-white">{agent.name}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExportOverlayOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {(["Json", "Csv", "Pdf"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => void handleExport(format)}
                    disabled={exportBusy !== null}
                    className="flex w-full items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-left text-white/80 transition hover:border-accent/25 hover:bg-accent/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="text-base font-medium text-white">{format}</span>
                    <span className="text-sm text-white/45">{exportBusy === format ? "Подготовка..." : "Скачать"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showLinuxReconnectHelp ? (
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

      {showWindowsReconnectHelp ? (
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
                  onClick={() => {
                    markAgentLaunched(agent.id, inferLocalAgentPlatform());
                  }}
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
