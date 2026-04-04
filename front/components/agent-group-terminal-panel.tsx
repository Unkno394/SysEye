"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Play, TerminalSquare, Users } from "lucide-react";
import { apiJson } from "@/lib/api-client";
import type { AgentDto, AgentTaskDto, CommandDto, PagedResult, ScenarioDetailsDto, ScenarioDto } from "@/lib/backend-types";
import { getAgentStatus, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { GlassCard, SectionTitle, StatusBadge } from "@/components/ui";

type GroupTask = {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  status: "queued" | "running" | "success" | "error";
  createdAt: string;
  output: string;
  kind: "command" | "scenario";
};

type PlaceholderInput = {
  index: number;
  token: string;
  label: string;
  value: string;
};

type CommandPlatformFilter = "all" | "linux" | "windows";
type ScenarioFilter = "all" | "ready" | "empty";
type HistoryStatusFilter = "all" | "queued" | "success" | "running" | "error";
type ActionNotice = { tone: "success" | "error"; text: string } | null;

type AgentGroupTerminalPanelProps = {
  groupName: string;
  agents: AgentDto[];
  commands: CommandDto[];
};

function formatTaskTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function resolveCommandForAgent(item: CommandDto, agent: AgentDto) {
  if (agent.os === 2) {
    return item.powerShellScript || item.bashScript || "";
  }

  return item.bashScript || item.powerShellScript || "";
}

function extractPlaceholderTokens(script: string) {
  const matches = script.match(/\$\d+/g) ?? [];
  return Array.from(new Set(matches)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function getPlaceholderIndex(token: string) {
  return Number(token.replace("$", ""));
}

function matchesCommandPlatform(command: CommandDto, filter: CommandPlatformFilter) {
  if (filter === "all") return true;

  const hasBash = Boolean(command.bashScript?.trim());
  const hasPowerShell = Boolean(command.powerShellScript?.trim());

  if (filter === "linux") return hasBash;
  return hasPowerShell;
}

function getTaskOutput(task: AgentTaskDto) {
  const combined = [task.output, task.error].filter(Boolean).join(task.output && task.error ? "\n" : "");
  if (combined) return combined;

  if (task.status === "queued") {
    return "Команда поставлена в очередь.";
  }

  if (task.status === "running") {
    return "Команда уже выполняется на подключённой машине.";
  }

  if (task.status === "success") {
    return "Команда завершилась без дополнительного вывода.";
  }

  return "Команда завершилась с ошибкой без дополнительного вывода.";
}

function buildBatchNotice(base: string, successCount: number, totalCount: number): ActionNotice {
  if (successCount <= 0) {
    return {
      tone: "error",
      text: `${base} не отправлен ни на одну машину.`,
    };
  }

  if (successCount === totalCount) {
    return {
      tone: "success",
      text: `${base} отправлен на ${successCount} ${successCount === 1 ? "машину" : successCount < 5 ? "машины" : "машин"}.`,
    };
  }

  return {
    tone: "success",
    text: `${base} отправлен на ${successCount} из ${totalCount} машин.`,
  };
}

export function AgentGroupTerminalPanel({ groupName, agents, commands }: AgentGroupTerminalPanelProps) {
  const [serverTasks, setServerTasks] = useState<GroupTask[]>([]);
  const [loadedScenarios, setLoadedScenarios] = useState<ScenarioDetailsDto[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<HistoryStatusFilter>("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [draftSelectedDate, setDraftSelectedDate] = useState("");
  const [placeholderModalOpen, setPlaceholderModalOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<CommandDto | null>(null);
  const [placeholderInputs, setPlaceholderInputs] = useState<PlaceholderInput[]>([]);
  const [placeholderError, setPlaceholderError] = useState<string | null>(null);
  const [placeholderLoading, setPlaceholderLoading] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandPlatformFilter, setCommandPlatformFilter] = useState<CommandPlatformFilter>("all");
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>("all");
  const [actionNotice, setActionNotice] = useState<ActionNotice>(null);

  const loadTasks = async () => {
    if (!agents.length) {
      setServerTasks([]);
      return;
    }

    const responses = await Promise.allSettled(
      agents.map((agent) =>
        apiJson<PagedResult<AgentTaskDto>>(`/api/hackaton/agent/${agent.id}/tasks?take=20&skip=0`, { method: "GET" }),
      ),
    );

    const nextTasks: GroupTask[] = [];

    responses.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        return;
      }

      const agent = agents[index];

      for (const task of result.value.items ?? []) {
        nextTasks.push({
          id: `${agent.id}:${task.id}`,
          agentId: agent.id,
          agentName: agent.name,
          title: task.title,
          status: task.status,
          createdAt: task.createdAt,
          output: getTaskOutput(task),
          kind: "command",
        });
      }
    });

    setServerTasks(nextTasks);
  };

  const loadScenarios = async () => {
    try {
      const data = await apiJson<PagedResult<ScenarioDto>>(
        "/api/hackaton/scenario?take=100&skip=0",
        { method: "GET" },
      );

      const items = await Promise.all(
        (data.items ?? []).map(async (scenario) => {
          try {
            const details = await apiJson<ScenarioDetailsDto>(
              `/api/hackaton/scenario/${scenario.id}`,
              { method: "GET" },
            );

            return {
              ...details,
              isSystem: Boolean(scenario.isSystem),
            };
          } catch {
            return {
              ...scenario,
              commands: [],
              isSystem: Boolean(scenario.isSystem),
            };
          }
        }),
      );

      setLoadedScenarios(items);
    } catch {
      setLoadedScenarios([]);
    }
  };

  useEffect(() => {
    void loadTasks();
    void loadScenarios();

    const intervalId = window.setInterval(() => {
      void loadTasks();
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agents]);

  const tasks = useMemo(() => {
    return [...serverTasks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [serverTasks]);

  const visibleCommands = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase();

    return commands.filter((command) => {
      if (!matchesCommandPlatform(command, commandPlatformFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchText = [command.name, command.description, command.bashScript, command.powerShellScript]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [commandPlatformFilter, commandQuery, commands]);

  const visibleScenarios = useMemo(() => {
    const normalizedQuery = scenarioQuery.trim().toLowerCase();

    return loadedScenarios.filter((scenario) => {
      if (scenarioFilter === "ready" && !scenario.commands.length) {
        return false;
      }

      if (scenarioFilter === "empty" && scenario.commands.length) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchText = [scenario.name, scenario.description, ...(scenario.commands ?? []).map((item) => item.commandName)]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [loadedScenarios, scenarioFilter, scenarioQuery]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesDate = !selectedDate || task.createdAt.slice(0, 10) === selectedDate;
      return matchesStatus && matchesDate;
    });
  }, [selectedDate, statusFilter, tasks]);

  const onlineAgents = useMemo(() => agents.filter((agent) => getAgentStatus(agent.lastHeartbeatAt) === "online").length, [agents]);

  const latestHeartbeat = useMemo(() => {
    const timestamps = agents
      .map((agent) => new Date(agent.lastHeartbeatAt).getTime())
      .filter((value) => !Number.isNaN(value));

    if (!timestamps.length) {
      return "нет данных";
    }

    return getRelativeHeartbeatLabel(new Date(Math.max(...timestamps)).toISOString());
  }, [agents]);

  const runBatch = async (requests: Promise<unknown>[], label: string) => {
    const results = await Promise.allSettled(requests);
    const successCount = results.filter((result) => result.status === "fulfilled").length;

    setActionNotice(buildBatchNotice(label, successCount, requests.length));
    await loadTasks();

    return successCount > 0;
  };

  const queueCommandTask = async (item: CommandDto) => {
    await runBatch(
      agents.map((agent) => {
        const command = resolveCommandForAgent(item, agent).trim();
        if (!command) {
          return Promise.reject(new Error(`Для агента ${agent.name} команда не настроена.`));
        }

        return apiJson<AgentTaskDto>(
          `/api/hackaton/agent/${agent.id}/tasks/command`,
          {
            method: "POST",
            body: JSON.stringify({
              title: item.name,
              command,
            }),
          },
        );
      }),
      "Запуск",
    );
  };

  const executeTemplateCommand = async (commandId: string, values: Record<number, string>) => {
    await runBatch(
      agents.map((agent) =>
        apiJson<{ message: string; executionId: string }>(
          `/api/hackaton/task/agents/${agent.id}/execute`,
          {
            method: "POST",
            body: JSON.stringify({
              commandId,
              placeholderValues: values,
            }),
          },
        ),
      ),
      "Шаблонный запуск",
    );
  };

  const handleCommandClick = (item: CommandDto) => {
    const tokens = Array.from(
      new Set(
        agents.flatMap((agent) => extractPlaceholderTokens(resolveCommandForAgent(item, agent))),
      ),
    ).sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));

    if (!tokens.length) {
      void queueCommandTask(item);
      return;
    }

    void (async () => {
      setPlaceholderLoading(true);
      setPendingCommand(item);
      setPlaceholderError(null);
      setPlaceholderModalOpen(true);

      try {
        const loadedPlaceholders = await apiJson<{ index: number; name: string }[]>(
          `/api/hackaton/command/${item.id}/placeholders`,
          { method: "GET" },
        );

        const placeholderMap = new Map((loadedPlaceholders ?? []).map((placeholder) => [placeholder.index, placeholder.name]));
        setPlaceholderInputs(
          tokens.map((token) => {
            const index = getPlaceholderIndex(token);
            const label = placeholderMap.get(index)?.trim() || `Параметр ${token}`;
            return { index, token, label, value: "" };
          }),
        );
      } catch (error) {
        setPlaceholderInputs(
          tokens.map((token) => {
            const index = getPlaceholderIndex(token);
            return { index, token, label: `Параметр ${token}`, value: "" };
          }),
        );
        setPlaceholderError(error instanceof Error ? error.message : "Не удалось загрузить параметры команды.");
      } finally {
        setPlaceholderLoading(false);
      }
    })();
  };

  const handleScenarioClick = (scenarioId: string) => {
    void runBatch(
      agents.map((agent) =>
        apiJson<AgentTaskDto[]>(
          `/api/hackaton/agent/${agent.id}/tasks/scenario/${scenarioId}`,
          { method: "POST" },
        ),
      ),
      "Сценарий",
    );
  };

  const handleSubmitPlaceholderCommand = () => {
    if (!pendingCommand) return;

    if (placeholderInputs.some((item) => !item.value.trim())) {
      setPlaceholderError("Заполни все параметры перед запуском.");
      return;
    }

    void (async () => {
      try {
        await executeTemplateCommand(
          pendingCommand.id,
          Object.fromEntries(placeholderInputs.map((item) => [item.index, item.value.trim()])),
        );
        setPlaceholderModalOpen(false);
        setPendingCommand(null);
        setPlaceholderInputs([]);
        setPlaceholderError(null);
      } catch (error) {
        setPlaceholderError(error instanceof Error ? error.message : "Не удалось поставить команду в очередь.");
      }
    })();
  };

  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <SectionTitle
          title="Запуск по группе"
          subtitle={`${groupName}. Команды и сценарии отправляются сразу на все выбранные машины.`}
          action={
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
              <Users size={14} />
              <span>{onlineAgents}/{agents.length} online</span>
            </div>
          }
        />
        {actionNotice ? (
          <div
            className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
              actionNotice.tone === "success"
                ? "border-accent/20 bg-accent/10 text-accent"
                : "border-rose-400/20 bg-rose-400/10 text-rose-100/90"
            }`}
          >
            {actionNotice.text}
          </div>
        ) : null}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-[420px] bg-[#03090d] p-3 text-sm sm:p-5">
          <div className="mb-4 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/12 px-3 py-2 text-xs uppercase tracking-[0.18em] text-accent">
              <TerminalSquare size={14} />
              Команды
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <input
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Поиск по названию, описанию или команде"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/25"
              />

              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: "Все" },
                  { value: "linux", label: "Linux" },
                  { value: "windows", label: "Windows" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCommandPlatformFilter(item.value as CommandPlatformFilter)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      commandPlatformFilter === item.value
                        ? "border-accent/30 bg-accent/12 text-accent"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="terminal-scroll mt-3 flex gap-3 overflow-x-auto pb-1">
              {visibleCommands.map((item) => {
                const hasPlaceholders = agents.some((agent) => extractPlaceholderTokens(resolveCommandForAgent(item, agent)).length > 0);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCommandClick(item)}
                    className="w-[280px] shrink-0 rounded-2xl border border-white/8 bg-black/20 p-3 text-left transition hover:border-line hover:bg-white/[0.04] sm:w-[300px]"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="break-words font-medium text-white">{item.name}</div>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/40">
                        {item.isSystem ? "system" : "custom"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-white/50">{item.description || "Описание не задано."}</div>
                    <div className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-[#041016] px-3 py-2 font-mono text-xs text-[#9af7c8] break-words">
                      {item.bashScript || item.powerShellScript || "Скрипт не задан"}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-white/40">{hasPlaceholders ? "Откроется один ввод параметров для всей группы" : "Готова к запуску"}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Play size={12} />
                        Запустить на группе
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {!visibleCommands.length ? (
              <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                {commands.length ? "По запросу ничего не найдено." : "Команд пока нет."}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="rounded-xl border border-accent/30 bg-accent/12 px-3 py-2 text-xs uppercase tracking-[0.18em] text-accent">Сценарии</div>

            <div className="mt-3 flex flex-col gap-3">
              <input
                value={scenarioQuery}
                onChange={(event) => setScenarioQuery(event.target.value)}
                placeholder="Поиск по названию, описанию или шагам"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/25"
              />

              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: "Все" },
                  { value: "ready", label: "С командами" },
                  { value: "empty", label: "Пустые" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setScenarioFilter(item.value as ScenarioFilter)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      scenarioFilter === item.value
                        ? "border-accent/30 bg-accent/12 text-accent"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="terminal-scroll mt-3 flex gap-3 overflow-x-auto pb-1">
              {visibleScenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleScenarioClick(scenario.id)}
                  className="w-[280px] shrink-0 rounded-2xl border border-white/8 bg-black/20 p-3 text-left transition hover:border-line hover:bg-white/[0.04] sm:w-[300px]"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="break-words font-medium text-white">{scenario.name}</div>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/40">
                      {scenario.isSystem ? "system" : "custom"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-white/50">{scenario.description}</div>
                  <div className="mt-3 rounded-xl border border-white/8 bg-[#041016] px-3 py-2 text-xs text-white/55">
                    {(scenario.commands ?? []).map((command, index) => (
                      <div key={`${scenario.id}-${command.commandId}`} className="truncate">
                        {index + 1}. {command.commandName}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-accent">
                    <Play size={12} />
                    Запустить на группе
                  </div>
                </button>
              ))}
            </div>

            {!visibleScenarios.length ? (
              <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                {loadedScenarios.length ? "По запросу ничего не найдено." : "Сценариев пока нет."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-line bg-white/[0.03] p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex h-[60svh] min-h-[320px] flex-col overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/20 p-4 sm:h-[68svh] sm:p-5 lg:h-[720px]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/55">История выполнения</h3>
                <p className="mt-1 text-xs text-white/35">Last heartbeat: {latestHeartbeat}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftStatusFilter(statusFilter);
                  setDraftSelectedDate(selectedDate);
                  setFiltersOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60 transition hover:text-white sm:w-auto"
              >
                <CalendarRange size={14} />
                Фильтры
              </button>
            </div>

            <div className="terminal-scroll mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {filteredTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-white">{task.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
                        <span>{formatTaskTime(task.createdAt)} · {task.kind === "scenario" ? "Сценарий" : "Команда"}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
                          {task.agentName}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/8 bg-[#081018] p-3 font-mono text-xs text-[#9af7c8] break-words whitespace-pre-wrap">
                    {task.output}
                  </div>
                </div>
              ))}

              {!filteredTasks.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                  История пока пустая.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {placeholderModalOpen && pendingCommand ? (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
            <div className="w-full max-w-lg rounded-[1.55rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.8rem] sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white">{pendingCommand.name}</h3>
                  <p className="mt-1 text-sm text-white/55">Заполни параметры один раз и команда уйдёт на все машины группы.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlaceholderModalOpen(false);
                    setPendingCommand(null);
                    setPlaceholderInputs([]);
                    setPlaceholderError(null);
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {placeholderError ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{placeholderError}</div>
                ) : null}
                {placeholderLoading ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">Загрузка параметров...</div>
                ) : null}
                {placeholderInputs.map((item, index) => (
                  <div key={item.token}>
                    <label className="mb-2 block text-sm text-white/60">
                      {item.label}
                      <span className="ml-2 font-mono text-white/35">{item.token}</span>
                    </label>
                    <input
                      value={item.value}
                      onChange={(event) =>
                        setPlaceholderInputs((prev) =>
                          prev.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, value: event.target.value } : current,
                          ),
                        )
                      }
                      placeholder={item.label === `Параметр ${item.token}` ? `Значение для ${item.token}` : item.label}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25"
                    />
                    <div className="mt-2 text-xs text-white/35">Значение подставится в шаблон вместо {item.token}.</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSubmitPlaceholderCommand}
                  disabled={placeholderLoading}
                  className="inline-flex items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/20"
                >
                  Запустить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaceholderModalOpen(false);
                    setPendingCommand(null);
                    setPlaceholderInputs([]);
                    setPlaceholderError(null);
                  }}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
            <div className="w-full max-w-md rounded-[1.55rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.8rem] sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white">Фильтры истории</h3>
                  <p className="mt-1 text-sm text-white/55">Фильтруй историю запусков по дате и статусу.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55 transition hover:text-white"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-2 text-sm text-white/60">Конкретная дата</div>
                  <input
                    type="date"
                    value={draftSelectedDate}
                    onChange={(event) => setDraftSelectedDate(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none [color-scheme:dark] focus:border-accent/25"
                  />
                </div>

                <div>
                  <div className="mb-2 text-sm text-white/60">Статус</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "Все" },
                      { value: "queued", label: "В очереди" },
                      { value: "success", label: "Успех" },
                      { value: "running", label: "В работе" },
                      { value: "error", label: "Ошибка" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setDraftStatusFilter(item.value as HistoryStatusFilter)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          draftStatusFilter === item.value
                            ? "border-accent/30 bg-accent/12 text-accent"
                            : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(draftSelectedDate);
                    setStatusFilter(draftStatusFilter);
                    setFiltersOpen(false);
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/20"
                >
                  Применить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftSelectedDate("");
                    setDraftStatusFilter("all");
                    setSelectedDate("");
                    setStatusFilter("all");
                    setFiltersOpen(false);
                  }}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                >
                  Сбросить
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
