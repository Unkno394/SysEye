"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers3, Plus, Trash2 } from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { GlassCard, PrimaryButton, SectionTitle } from "@/components/ui";
import { apiJson } from "@/lib/api-client";
import { getAgentGroups, removeAgentGroup, subscribeToAgentGroups, upsertAgentGroup, type AgentGroup } from "@/lib/agent-groups";
import type { AgentConnectionTokenDto, AgentDto, PagedResult } from "@/lib/backend-types";
import { getAgentStatus, getDistributionLabel } from "@/lib/backend-types";

const CLI_PYPI_INSTALL = "pipx install syseye-agent";
const DEFAULT_AGENT_SERVER_URL = "http://localhost:5000";
const buildLinuxServiceGenerateCommand = (serverUrl: string, token: string) =>
  `syseye-agent service linux --server ${serverUrl} --token "${token}" > ~/.config/systemd/user/syseye-agent.service`;
const LINUX_SERVICE_ENABLE_COMMAND = "systemctl --user daemon-reload && systemctl --user enable --now syseye-agent.service";
const WINDOWS_PIPX_INSTALL = "py -m pip install --user pipx && py -m pipx ensurepath";
const buildWindowsServiceGenerateCommand = (serverUrl: string, token: string) =>
  `syseye-agent service windows --server ${serverUrl} --token "${token}" > install-syseye-agent.ps1`;
const WINDOWS_SERVICE_ENABLE_COMMAND = "powershell -ExecutionPolicy Bypass -File .\\install-syseye-agent.ps1";

export default function DashboardPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [createdAgentToken, setCreatedAgentToken] = useState<string | null>(null);
  const [instructionPlatform, setInstructionPlatform] = useState<"linux" | "windows">("linux");
  const [agentServerUrl, setAgentServerUrl] = useState(DEFAULT_AGENT_SERVER_URL);

  const loadGroups = () => {
    setGroups(getAgentGroups());
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
    const intervalId = window.setInterval(() => {
      void loadAgents(true);
    }, 10_000);
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
    if (typeof window === "undefined") return;

    const { hostname } = window.location;
    if (!hostname) return;

    setAgentServerUrl(`http://${hostname}:5000`);
  }, []);

  const summary = useMemo(() => {
    const online = agents.filter((agent) => getAgentStatus(agent.lastHeartbeatAt) === "online").length;
    const offline = agents.filter((agent) => getAgentStatus(agent.lastHeartbeatAt) === "offline").length;
    return {
      online,
      busy: 0,
      offline,
    };
  }, [agents]);

  const selectedGroupAgentIdSet = useMemo(() => new Set(selectedGroupAgentIds), [selectedGroupAgentIds]);

  const filteredGroupAgents = useMemo(() => {
    const normalizedQuery = groupAgentQuery.trim().toLowerCase();
    if (!normalizedQuery) return agents;

    return agents.filter((agent) => {
      const searchText = [agent.name, getDistributionLabel(agent.distribution, agent.os), agent.ipAddress ?? ""]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [agents, groupAgentQuery]);

  const handleCreateAgent = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const agentId = await apiJson<string>(
        "/api/hackaton/agent",
        {
          method: "POST",
          body: JSON.stringify({
            name: newAgentName,
          }),
        },
        "Не удалось создать агента.",
      );

      const connection = await apiJson<AgentConnectionTokenDto>(
        `/api/hackaton/agent/${agentId}/connection-token`,
        { method: "GET" },
        "Не удалось выпустить токен подключения.",
      );

      setCreatedAgentToken(connection.token);
      await loadAgents();
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : "Не удалось создать агента.");
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreating(false);
    setNewAgentName("");
    setCreateError(null);
    setCreatedAgentToken(null);
    setInstructionPlatform("linux");
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
              Новый агент
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>

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
                .filter((agent): agent is AgentDto => Boolean(agent));
              const groupOnline = groupAgents.filter((agent) => getAgentStatus(agent.lastHeartbeatAt) === "online").length;
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
        ) : agents.length ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <GlassCard className="p-8 text-center text-white/55">
            Агентов пока нет. Создай первый агент.
            {error ? <div className="mt-3 text-sm text-white/35">Список сейчас недоступен, но новых агентов можно добавить вручную.</div> : null}
          </GlassCard>
        )}
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
          <div className="w-full max-w-xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-white">{createdAgentToken ? "Токен подключения" : "Новый агент"}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  {createdAgentToken
                    ? "Ниже готовые шаги для подключения машины."
                    : "Укажи имя машины. После создания появятся шаги для подключения."}
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

            {createdAgentToken ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-4 text-sm text-white/70">
                  Карточка агента создана.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/60">
                  <div className="text-sm font-medium text-white">Как подключить агент</div>
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

                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">Адрес сервера для агента</div>
                      <div className="mt-2 text-xs text-white/45">Если агент ставишь на другую машину или ВМ, подставь сюда IP или домен сервера вместо `localhost`.</div>
                      <input
                        value={agentServerUrl}
                        onChange={(event) => setAgentServerUrl(event.target.value)}
                        placeholder={DEFAULT_AGENT_SERVER_URL}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-accent/25"
                      />
                    </div>

                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                      {instructionPlatform === "linux" ? "Linux" : "Windows"}
                    </div>

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">Шаг 1. Установить CLI</div>
                      <div className="mt-2 text-xs text-white/45">Если `pipx` ещё не установлен:</div>
                      <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                        {instructionPlatform === "linux" ? "sudo pacman -S python-pipx" : WINDOWS_PIPX_INSTALL}
                      </div>
                      <div className="mt-2 text-xs text-white/45">Установка агента из PyPI доступна из любой папки:</div>
                      <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                        {CLI_PYPI_INSTALL}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">Шаг 2. Сгенерировать сервис</div>
                      {instructionPlatform === "linux" ? (
                        <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                          mkdir -p ~/.config/systemd/user
                        </div>
                      ) : null}
                      <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                        {instructionPlatform === "linux"
                          ? buildLinuxServiceGenerateCommand(agentServerUrl, createdAgentToken)
                          : buildWindowsServiceGenerateCommand(agentServerUrl, createdAgentToken)}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">Шаг 3. Включить автозапуск</div>
                      <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-[#9af7c8]">
                        {instructionPlatform === "linux"
                          ? LINUX_SERVICE_ENABLE_COMMAND
                          : WINDOWS_SERVICE_ENABLE_COMMAND}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <Field label="Имя машины" value={newAgentName} onChange={setNewAgentName} placeholder="Например: Main Office PC" />
              </div>
            )}

            {createError ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{createError}</div> : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {createdAgentToken ? (
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
                    {creating ? "Создание..." : "Создать агента"}
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
                      const status = getAgentStatus(agent.lastHeartbeatAt);

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
