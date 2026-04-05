"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Layers3, Plus, Trash2 } from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { AgentRatingBoard } from "@/components/agent-rating-board";
import { GlassCard, PrimaryButton, SectionTitle } from "@/components/ui";
import { apiJson } from "@/lib/api-client";
import { getAgentGroups, removeAgentFromGroups, removeAgentGroup, subscribeToAgentGroups, upsertAgentGroup, type AgentGroup } from "@/lib/agent-groups";
import {
  type AgentLaunchPlatform,
  buildAgentReconnectUrl,
  buildLinuxServiceGenerateCommand,
  buildWindowsInstallScriptContent,
  getCliInstallCommand,
  getDefaultAgentServerUrl,
  getLinuxServiceEnableCommand,
  getWindowsPathRefreshNote,
  getWindowsPipxInstallCommand,
  getWindowsServiceEnableCommand,
  inferLocalAgentPlatform,
  inferAgentServerUrl,
} from "@/lib/agent-launch";
import type { AgentConnectionTokenDto, AgentDto, AgentRatingDto, PagedResult } from "@/lib/backend-types";
import { getDistributionLabel } from "@/lib/backend-types";
import { useClientRealtime } from "@/lib/client-realtime";
import { applyEffectiveAgentMetadata, clearAgentLaunch, getEffectiveAgentStatus, markAgentLaunched, useLocalAgentHeartbeats, useLocalAgentLaunches } from "@/lib/local-agent-runtime";

const CLI_PYPI_INSTALL = getCliInstallCommand();
const DEFAULT_AGENT_SERVER_URL = getDefaultAgentServerUrl();
const LINUX_SERVICE_ENABLE_COMMAND = getLinuxServiceEnableCommand();
const WINDOWS_PIPX_INSTALL = getWindowsPipxInstallCommand();
const WINDOWS_PATH_REFRESH_NOTE = getWindowsPathRefreshNote();
const WINDOWS_SERVICE_ENABLE_COMMAND = getWindowsServiceEnableCommand();

export default function DashboardPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [agentRatings, setAgentRatings] = useState<AgentRatingDto[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupAgentIds, setSelectedGroupAgentIds] = useState<string[]>([]);
  const [groupAgentQuery, setGroupAgentQuery] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [createdConnection, setCreatedConnection] = useState<AgentConnectionTokenDto | null>(null);
  const [instructionPlatform, setInstructionPlatform] = useState<AgentLaunchPlatform>(inferLocalAgentPlatform);
  const [agentServerUrl, setAgentServerUrl] = useState(DEFAULT_AGENT_SERVER_URL);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [copiedInstructionId, setCopiedInstructionId] = useState<string | null>(null);
  const localLaunches = useLocalAgentLaunches();

  const loadGroups = () => {
    setGroups(getAgentGroups());
  };

  const loadAgentRatings = async (background = false) => {
    if (!background) {
      setRatingsLoading(true);
    }

    try {
      const data = await apiJson<AgentRatingDto[]>(
        "/api/hackaton/analytics/agents/ratings",
        { method: "GET" },
        "Не удалось загрузить рейтинг агентов.",
      );
      setAgentRatings(data ?? []);
      setRatingsError(null);
    } catch (loadError) {
      setAgentRatings([]);
      setRatingsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить рейтинг агентов.");
    } finally {
      if (!background) {
        setRatingsLoading(false);
      }
    }
  };

  const loadAgents = async (background = false) => {
    if (!background) {
      setLoading(true);
    }

    setError(null);

    try {
      const data = await apiJson<PagedResult<AgentDto>>("/api/hackaton/agent?take=100&skip=0", { method: "GET" }, "Не удалось загрузить агентов.");
      setAgents(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить агентов.");
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadAgents();
    void loadAgentRatings();
    const intervalId = window.setInterval(() => {
      void loadAgents(true);
      void loadAgentRatings(true);
    }, 60_000);
    const stopGroupsSubscription = subscribeToAgentGroups(() => {
      loadGroups();
    });
    loadGroups();

    return () => {
      stopGroupsSubscription();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setAgentServerUrl(inferAgentServerUrl());
  }, []);

  useClientRealtime({
    onAgentUpdated: (updatedAgent) => {
      setAgents((current) => {
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
    onAgentDeleted: ({ agentId: deletedAgentId }) => {
      removeAgentFromGroups(deletedAgentId);
      setAgents((current) => current.filter((agent) => agent.id !== deletedAgentId));
    },
  });

  useLocalAgentHeartbeats(
    agents
      .filter((agent) => localLaunches[agent.id])
      .map((agent) => agent.id),
  );

  const effectiveAgents = useMemo(
    () => agents.map((agent) => applyEffectiveAgentMetadata(agent, localLaunches)),
    [agents, localLaunches],
  );

  const summary = useMemo(() => {
    const online = effectiveAgents.filter((agent) => getEffectiveAgentStatus(agent, localLaunches) === "online").length;
    const offline = effectiveAgents.filter((agent) => getEffectiveAgentStatus(agent, localLaunches) === "offline").length;
    return {
      online,
      busy: 0,
      offline,
    };
  }, [effectiveAgents, localLaunches]);

  const selectedGroupAgentIdSet = useMemo(() => new Set(selectedGroupAgentIds), [selectedGroupAgentIds]);

  const filteredGroupAgents = useMemo(() => {
    const normalizedQuery = groupAgentQuery.trim().toLowerCase();
    if (!normalizedQuery) return effectiveAgents;

    return effectiveAgents.filter((agent) => {
      const searchText = [agent.name, getDistributionLabel(agent.distribution, agent.os), agent.ipAddress ?? ""]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [effectiveAgents, groupAgentQuery]);

  const handleCreateAgent = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const connection = await apiJson<AgentConnectionTokenDto>(
        "/api/hackaton/agent/connection-token",
        {
          method: "POST",
          body: JSON.stringify({
            name: newAgentName,
          }),
        },
        "Не удалось выпустить токен подключения.",
      );

      setCreatedConnection(connection);
      markAgentLaunched(connection.agentId, inferLocalAgentPlatform());
      const reconnectUrl = buildAgentReconnectUrl(agentServerUrl, connection.token);
      window.location.assign(reconnectUrl);
      window.setTimeout(() => {
        void loadAgents(true);
      }, 4_000);
      window.setTimeout(() => {
        void loadAgents(true);
      }, 9_000);
      await loadAgents(true);
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : "Не удалось выпустить токен подключения.");
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreating(false);
    setNewAgentName("");
    setCreateError(null);
    setCreatedConnection(null);
    setInstructionPlatform(inferLocalAgentPlatform());
    setCopiedInstructionId(null);
  };

  const handleCopyInstruction = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedInstructionId(id);
      window.setTimeout(() => {
        setCopiedInstructionId((current) => (current === id ? null : current));
      }, 3000);
    } catch {
      setCreateError("Не удалось скопировать текст в буфер обмена.");
    }
  };

  const handleOpenGroupModal = () => {
    setGroupOpen(true);
    setGroupSaving(false);
    setNewGroupName("");
    setSelectedGroupAgentIds([]);
    setGroupAgentQuery("");
    setGroupError(null);
  };

  const handleCloseGroupModal = () => {
    setGroupOpen(false);
    setGroupSaving(false);
    setNewGroupName("");
    setSelectedGroupAgentIds([]);
    setGroupAgentQuery("");
    setGroupError(null);
  };

  const handleCreateGroup = () => {
    setGroupSaving(true);
    setGroupError(null);

    try {
      if (!newGroupName.trim()) {
        throw new Error("Задай название группы.");
      }

      if (!selectedGroupAgentIds.length) {
        throw new Error("Выбери хотя бы одну машину.");
      }

      const group = upsertAgentGroup({
        name: newGroupName,
        agentIds: selectedGroupAgentIds,
      });

      handleCloseGroupModal();
      router.push(`/dashboard/groups/${group.id}`);
    } catch (groupSaveError) {
      setGroupError(groupSaveError instanceof Error ? groupSaveError.message : "Не удалось сохранить группу.");
      setGroupSaving(false);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    removeAgentGroup(groupId);
  };

  const handleDeleteAgent = async (agent: AgentDto) => {
    if (!window.confirm(`Удалить агента "${agent.name}"?`)) {
      return;
    }

    setDeletingAgentId(agent.id);
    setError(null);

    try {
      await apiJson<void>(`/api/hackaton/agent/${agent.id}`, { method: "DELETE" }, "Не удалось удалить агента.");
      clearAgentLaunch(agent.id);
      removeAgentFromGroups(agent.id);
      setAgents((current) => current.filter((item) => item.id !== agent.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента.");
    } finally {
      setDeletingAgentId(null);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <GlassCard className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-accent/90">
              Agents
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Страница агентов
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
              Здесь видно, какие агенты online и offline, и можно сразу открыть нужную машину или добавить новую.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={handleOpenGroupModal}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 sm:w-auto"
            >
              <Layers3 size={16} />
              Новая группа
            </button>
            <PrimaryButton onClick={() => setCreateOpen(true)} className="w-full gap-2 sm:w-auto">
              <Plus size={16} />
              Подключить агент
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>

      <div>
        <AgentRatingBoard ratings={agentRatings} loading={ratingsLoading} />
        {ratingsError ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">
            {ratingsError}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Online</div>
          <div className="mt-3 text-3xl font-semibold text-white">{summary.online}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Busy</div>
          <div className="mt-3 text-3xl font-semibold text-white">{summary.busy}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Offline</div>
          <div className="mt-3 text-3xl font-semibold text-white">{summary.offline}</div>
        </GlassCard>
      </div>

      <section>
        <SectionTitle
          title="Группы агентов"
          subtitle="Сохраняй наборы машин и открывай отдельный экран для массового запуска команд и сценариев."
        />

        {groups.length ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {groups.map((group) => {
              const groupAgents = group.agentIds
                .map((agentId) => agents.find((agent) => agent.id === agentId))
                .map((agent) => (agent ? applyEffectiveAgentMetadata(agent, localLaunches) : null))
                .filter((agent): agent is AgentDto => Boolean(agent));
              const groupOnline = groupAgents.filter((agent) => getEffectiveAgentStatus(agent, localLaunches) === "online").length;
              const preview = groupAgents.slice(0, 3).map((agent) => agent.name).join(" · ");

              return (
                <GlassCard key={group.id} className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="truncate text-lg font-semibold text-white">{group.name}</h3>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-white/45">
                          Group
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-white/55">
                        {group.agentIds.length} {group.agentIds.length === 1 ? "машина" : group.agentIds.length < 5 ? "машины" : "машин"} · {groupOnline} online
                      </div>
                    </div>

                    <div className="flex w-full gap-2 sm:w-auto">
                      <Link
                        href={`/dashboard/groups/${group.id}`}
                        className="inline-flex flex-1 items-center justify-center rounded-xl border border-accent/20 px-3 py-2 text-sm text-accent transition hover:bg-accent/10 sm:flex-none"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group.id)}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-rose-200 transition hover:bg-rose-400/15"
                        aria-label={`Удалить группу ${group.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/40">Состав</div>
                      <div className="mt-2 text-sm text-white">{preview || "Машины пока не найдены"}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/40">Что дальше</div>
                      <div className="mt-2 text-sm text-white">На отдельной странице команда или сценарий уйдут сразу на всю группу.</div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard className="p-8 text-center text-white/55">
            Групп пока нет. Собери первую группу и открывай её как отдельный рабочий экран.
          </GlassCard>
        )}
      </section>

      <section>
        <SectionTitle
          title="Подключённые агенты"
          subtitle="Открывай карточку агента, чтобы смотреть его параметры, обновлять heartbeat и запускать команды."
        />

        {loading ? (
          <GlassCard className="p-8 text-center text-white/55">Загрузка агентов...</GlassCard>
        ) : error ? (
          <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-8 text-center text-rose-100/90">
            {error}
          </GlassCard>
        ) : agents.length ? (
          <div className="terminal-scroll max-h-[680px] overflow-y-auto pr-1">
            <div className="grid gap-5 xl:grid-cols-2">
            {effectiveAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                status={getEffectiveAgentStatus(agent, localLaunches)}
                onDelete={(currentAgent) => {
                  void handleDeleteAgent(currentAgent);
                }}
                deleteLoading={deletingAgentId === agent.id}
              />
            ))}
            </div>
          </div>
        ) : (
          <GlassCard className="p-8 text-center text-white/55">
            Агентов пока нет. Получи токен подключения и запусти агент на первой машине.
          </GlassCard>
        )}
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
          <div className="w-full max-w-3xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-white">{createdConnection ? "Токен подключения" : "Подключить агент"}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  {createdConnection
                    ? "Ниже готовые шаги для подключения машины. Этот токен привязан к конкретной карточке агента."
                    : "Задай кастомное имя машины. Остальное агент передаст сам при первом подключении."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreate}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
              >
                Закрыть
              </button>
            </div>

            {createdConnection ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-4 text-sm text-white/70">
                  Токен подключения готов. Ниже уже собраны команды под {instructionPlatform === "linux" ? "Linux" : "Windows"}.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/65">
                  <div>
                    Токен привязан к агенту <span className="font-medium text-white">{createdConnection.name || "Без имени"}</span>.
                  </div>
                  <div className="mt-3 text-xs text-white/45">
                    Сервис на машине нужно запускать именно с этим токеном. Команды потом отправляй в эту же карточку агента.
                  </div>
                  <div className="mt-4">
                    <CopyableInstructionBlock
                      title="Agent ID"
                      description="Можно быстро сверить, что сервис поднят именно для этой карточки."
                      value={createdConnection.agentId}
                      copied={copiedInstructionId === "agent-id"}
                      onCopy={() => {
                        void handleCopyInstruction("agent-id", createdConnection.agentId);
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
                  <div>
                    <div className="text-sm font-medium text-white">Как подключить агент</div>
                    <div className="mt-2 text-xs text-white/45">
                      Скопируй команды по шагам. Иконка справа копирует содержимое блока, после нажатия на 3 секунды появляется галочка.
                    </div>
                  </div>

                  <div className="mt-4 inline-flex w-full rounded-full border border-white/10 bg-black/20 p-1 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setInstructionPlatform("linux")}
                      className={`rounded-full px-4 py-2 text-sm transition ${
                        instructionPlatform === "linux" ? "bg-accent/20 text-accent" : "text-white/55 hover:text-white"
                      }`}
                    >
                      Linux
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstructionPlatform("windows")}
                      className={`rounded-full px-4 py-2 text-sm transition ${
                        instructionPlatform === "windows" ? "bg-accent/20 text-accent" : "text-white/55 hover:text-white"
                      }`}
                    >
                      Windows
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-3">
                    <InstructionStepCard
                      step="Шаг 1"
                      title="Установить CLI"
                      description="Сначала подготовь pipx и сам `syseye-agent`."
                    >
                      <CopyableInstructionBlock
                        title="Установка pipx"
                        description="Если pipx ещё не установлен."
                        value={instructionPlatform === "linux" ? "sudo pacman -S python-pipx" : WINDOWS_PIPX_INSTALL}
                        copied={copiedInstructionId === "install-pipx"}
                        onCopy={() => {
                          void handleCopyInstruction(
                            "install-pipx",
                            instructionPlatform === "linux" ? "sudo pacman -S python-pipx" : WINDOWS_PIPX_INSTALL,
                          );
                        }}
                      />

                      <div className="mt-3">
                        <CopyableInstructionBlock
                          title="Установка CLI"
                          description="Эту команду можно запускать из любой папки."
                          value={CLI_PYPI_INSTALL}
                          copied={copiedInstructionId === "install-cli"}
                          onCopy={() => {
                            void handleCopyInstruction("install-cli", CLI_PYPI_INSTALL);
                          }}
                        />
                      </div>

                      {instructionPlatform === "windows" ? (
                        <div className="mt-3 text-xs leading-5 text-white/45">
                          {WINDOWS_PATH_REFRESH_NOTE}
                        </div>
                      ) : null}
                    </InstructionStepCard>

                    <InstructionStepCard
                      step="Шаг 2"
                      title="Сгенерировать сервис"
                      description={instructionPlatform === "linux" ? "Создай `systemd --user` unit." : "Сгенерируй PowerShell-скрипт для автозапуска."}
                    >
                      {instructionPlatform === "linux" ? (
                        <CopyableInstructionBlock
                          title="Подготовка директории"
                          value="mkdir -p ~/.config/systemd/user"
                          copied={copiedInstructionId === "prepare-service-dir"}
                          onCopy={() => {
                            void handleCopyInstruction("prepare-service-dir", "mkdir -p ~/.config/systemd/user");
                          }}
                        />
                      ) : (
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs leading-5 text-white/55">
                          Сохрани текст ниже в файл <code>install-syseye-agent.ps1</code>.
                        </div>
                      )}

                      <div className="mt-3">
                        <CopyableInstructionBlock
                          title={instructionPlatform === "linux" ? "Команда генерации" : "Содержимое install-syseye-agent.ps1"}
                          value={instructionPlatform === "linux"
                            ? buildLinuxServiceGenerateCommand(agentServerUrl, createdConnection.token)
                            : buildWindowsInstallScriptContent(agentServerUrl, createdConnection.token)}
                          copied={copiedInstructionId === "generate-service"}
                          onCopy={() => {
                            void handleCopyInstruction(
                              "generate-service",
                              instructionPlatform === "linux"
                                ? buildLinuxServiceGenerateCommand(agentServerUrl, createdConnection.token)
                                : buildWindowsInstallScriptContent(agentServerUrl, createdConnection.token),
                            );
                          }}
                        />
                      </div>
                    </InstructionStepCard>

                    <InstructionStepCard
                      step="Шаг 3"
                      title="Запустить в фоне"
                      description="После этого агент должен выйти в online и начать слать heartbeat."
                    >
                      <CopyableInstructionBlock
                        title="Старт агента"
                        value={instructionPlatform === "linux"
                          ? LINUX_SERVICE_ENABLE_COMMAND
                          : WINDOWS_SERVICE_ENABLE_COMMAND}
                        copied={copiedInstructionId === "start-agent"}
                        onCopy={() => {
                          void handleCopyInstruction(
                            "start-agent",
                            instructionPlatform === "linux"
                              ? LINUX_SERVICE_ENABLE_COMMAND
                              : WINDOWS_SERVICE_ENABLE_COMMAND,
                          );
                        }}
                      />

                      {instructionPlatform === "windows" ? (
                        <div className="mt-3 text-xs leading-5 text-white/45">
                          Запусти команду один раз. После старта агента в hidden/background режиме терминал можно закрыть.
                        </div>
                      ) : null}
                    </InstructionStepCard>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <Field label="Имя машины" value={newAgentName} onChange={setNewAgentName} placeholder="Например: Main Office PC" />
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
                  ОС и дистрибутив агент определит сам при первом подключении.
                </div>
              </div>
            )}

            {createError ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{createError}</div> : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {createdConnection ? (
                <>
                  <button
                    type="button"
                    onClick={handleCloseCreate}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                  >
                    Готово
                  </button>
                </>
              ) : (
                <>
                  <PrimaryButton onClick={handleCreateAgent} disabled={creating || !newAgentName.trim()}>
                    {creating ? "Подготовка..." : "Получить токен"}
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={handleCloseCreate}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                  >
                    Отмена
                  </button>
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      ) : null}

      {groupOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
            <div className="w-full max-w-4xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-white">Новая группа</h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    Отметь нужные машины. После сохранения откроется отдельная страница группы, где можно запускать команды и сценарии сразу на всех.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseGroupModal}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <Field label="Название группы" value={newGroupName} onChange={setNewGroupName} placeholder="Например: prod / web" />

                <div>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block text-sm text-white/60">Машины в группе</label>
                    <div className="text-xs uppercase tracking-[0.16em] text-white/40">
                      Выбрано: {selectedGroupAgentIds.length}
                    </div>
                  </div>

                  <input
                    value={groupAgentQuery}
                    onChange={(event) => setGroupAgentQuery(event.target.value)}
                    placeholder="Поиск по имени, платформе или IP"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-accent/25"
                  />

                  <div className="mt-4 grid max-h-[420px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                    {filteredGroupAgents.map((agent) => {
                      const selected = selectedGroupAgentIdSet.has(agent.id);
                      const status = getEffectiveAgentStatus(agent, localLaunches);

                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() =>
                            setSelectedGroupAgentIds((prev) =>
                              prev.includes(agent.id)
                                ? prev.filter((item) => item !== agent.id)
                                : [...prev, agent.id],
                            )
                          }
                          className={`relative rounded-2xl border p-4 pl-14 text-left transition ${
                            selected
                              ? "border-accent/30 bg-accent/10"
                              : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`absolute left-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-lg border text-sm ${
                              selected
                                ? "border-accent/35 bg-accent/20 text-accent"
                                : "border-white/12 bg-white/[0.03] text-white/35"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </span>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 text-base font-medium text-white">{agent.name}</div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${
                              status === "online"
                                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                                : "border-white/10 bg-white/5 text-white/50"
                            }`}>
                              {status}
                            </span>
                          </div>

                          <div className="mt-2 text-sm text-white/55">
                            {[getDistributionLabel(agent.distribution, agent.os), agent.ipAddress || null].filter(Boolean).join(" · ") || "Параметры машины появятся позже."}
                          </div>
                          <div className="mt-2 text-xs text-white/35">Last heartbeat: {agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleString("ru-RU") : "нет данных"}</div>
                        </button>
                      );
                    })}
                  </div>

                  {!filteredGroupAgents.length ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                      По запросу ничего не найдено.
                    </div>
                  ) : null}
                </div>
              </div>

              {groupError ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{groupError}</div> : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton onClick={handleCreateGroup} disabled={groupSaving || !newGroupName.trim() || !selectedGroupAgentIds.length}>
                  {groupSaving ? "Сохранение..." : "Сохранить группу"}
                </PrimaryButton>
                <button
                  type="button"
                  onClick={handleCloseGroupModal}
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

function InstructionStepCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-accent/80">{step}</div>
      <div className="mt-2 text-base font-medium text-white">{title}</div>
      <div className="mt-1 text-xs leading-5 text-white/45">{description}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function CopyableInstructionBlock({
  title,
  value,
  onCopy,
  copied,
  description,
}: {
  title: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{title}</div>
          {description ? <div className="mt-1 text-xs leading-5 text-white/45">{description}</div> : null}
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Скопировано" : "Скопировать"}
          title={copied ? "Скопировано" : "Скопировать"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08]"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-[#9af7c8]">
        {value}
      </pre>
    </div>
  );
}
