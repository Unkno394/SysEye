"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Play, TerminalSquare } from "lucide-react";
import { apiJson } from "@/lib/api-client";
import type { AgentDto, AgentTaskDto, CommandDto, PagedResult } from "@/lib/backend-types";
import { getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { getAgentStatus } from "@/lib/backend-types";
import { scenarios } from "@/lib/mock-data";
import { GlassCard, SectionTitle, StatusBadge } from "@/components/ui";

type TerminalTask = {
  id: string;
  title: string;
  status: "queued" | "running" | "success" | "error";
  createdAt: string;
  output: string;
  kind: "command" | "scenario";
};

type PlaceholderInput = {
  token: string;
  value: string;
};

type CommandPlatformFilter = "all" | "linux" | "windows";
type ScenarioFilter = "all" | "system" | "custom";

type TerminalPanelProps = {
  agent: AgentDto;
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

function fillCommandTemplate(script: string, inputs: PlaceholderInput[]) {
  return inputs.reduce((result, item) => result.split(item.token).join(item.value.trim()), script);
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

export function TerminalPanel({ agent, commands }: TerminalPanelProps) {
  const [serverTasks, setServerTasks] = useState<TerminalTask[]>([]);
  const [localScenarioTasks, setLocalScenarioTasks] = useState<TerminalTask[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "success" | "running" | "error">("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<"all" | "queued" | "success" | "running" | "error">("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [draftSelectedDate, setDraftSelectedDate] = useState("");
  const [placeholderModalOpen, setPlaceholderModalOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<CommandDto | null>(null);
  const [placeholderInputs, setPlaceholderInputs] = useState<PlaceholderInput[]>([]);
  const [placeholderError, setPlaceholderError] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandPlatformFilter, setCommandPlatformFilter] = useState<CommandPlatformFilter>("all");
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>("all");
  const panelStatus = getAgentStatus(agent.lastHeartbeatAt);

  const loadTasks = async () => {
    try {
      const data = await apiJson<PagedResult<AgentTaskDto>>(
        `/api/hackaton/agent/${agent.id}/tasks?take=50&skip=0`,
        { method: "GET" },
      );

      setServerTasks(
        (data.items ?? []).map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          createdAt: task.createdAt,
          output: getTaskOutput(task),
          kind: "command",
        })),
      );
    } catch {
      setServerTasks([]);
    }
  };

  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => {
      void loadTasks();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [agent.id]);

  const tasks = useMemo(() => {
    return [...serverTasks, ...localScenarioTasks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [localScenarioTasks, serverTasks]);

  const visibleCommands = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase();

    return commands.filter((command) => {
      if (!matchesCommandPlatform(command, commandPlatformFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchText = [command.name, command.description, resolveCommandForAgent(command, agent)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [agent, commandPlatformFilter, commandQuery, commands]);

  const visibleScenarios = useMemo(() => {
    const normalizedQuery = scenarioQuery.trim().toLowerCase();

    return scenarios.filter((scenario) => {
      if (scenarioFilter === "system" && !scenario.isSystem) {
        return false;
      }

      if (scenarioFilter === "custom" && scenario.isSystem) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchText = [scenario.name, scenario.description, scenario.commands.join(" ")]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [scenarioFilter, scenarioQuery]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesDate = !selectedDate || task.createdAt.slice(0, 10) === selectedDate;
      return matchesStatus && matchesDate;
    });
  }, [selectedDate, statusFilter, tasks]);

  const queueLocalScenarioTask = (task: Omit<TerminalTask, "id" | "createdAt">) => {
    setLocalScenarioTasks((prev) => [
      {
        ...task,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const queueCommandTask = async (title: string, command: string) => {
    await apiJson<AgentTaskDto>(
      `/api/hackaton/agent/${agent.id}/tasks/command`,
      {
        method: "POST",
        body: JSON.stringify({
          title,
          command,
        }),
      },
      "Не удалось поставить команду в очередь.",
    );

    await loadTasks();
  };

  const handleCommandClick = (item: CommandDto) => {
    const resolvedCommand = resolveCommandForAgent(item, agent);
    const tokens = extractPlaceholderTokens(resolvedCommand);

    if (!tokens.length) {
      void queueCommandTask(item.name, resolvedCommand || "");
      return;
    }

    setPendingCommand(item);
    setPlaceholderInputs(tokens.map((token) => ({ token, value: "" })));
    setPlaceholderError(null);
    setPlaceholderModalOpen(true);
  };

  const handleScenarioClick = (scenarioId: string) => {
    const scenario = visibleScenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;

    queueLocalScenarioTask({
      kind: "scenario",
      title: scenario.name,
      status: "running",
      output: `Сценарий поставлен в очередь на выполнение.\n\n${scenario.commands.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    });
  };

  const handleSubmitPlaceholderCommand = () => {
    if (!pendingCommand) return;
    if (placeholderInputs.some((item) => !item.value.trim())) {
      setPlaceholderError("Заполни все параметры перед запуском.");
      return;
    }

    const resolvedCommand = resolveCommandForAgent(pendingCommand, agent);
    const finalCommand = fillCommandTemplate(resolvedCommand, placeholderInputs);

    void (async () => {
      try {
        await queueCommandTask(pendingCommand.name, finalCommand);
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
          title="Запуск команд"
          subtitle="Команды, сценарии и история запусков."
          action={
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
              <StatusBadge status={panelStatus} />
              <span>{panelStatus === "online" ? "Online" : "Offline"}</span>
            </div>
          }
        />
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
                const resolvedCommand = resolveCommandForAgent(item, agent);
                const hasPlaceholders = extractPlaceholderTokens(resolvedCommand).length > 0;

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
                      {resolvedCommand || "Скрипт не задан"}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-white/40">{hasPlaceholders ? "Нужны параметры перед запуском" : "Готова к запуску"}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Play size={12} />
                        Запустить
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
                  { value: "system", label: "Системные" },
                  { value: "custom", label: "Пользовательские" },
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
                    {scenario.commands.map((command, index) => (
                      <div key={`${scenario.id}-${command}`} className="truncate">
                        {index + 1}. {command}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-accent">
                    <Play size={12} />
                    Запустить сценарий
                  </div>
                </button>
              ))}
            </div>

            {!visibleScenarios.length ? (
              <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                {scenarios.length ? "По запросу ничего не найдено." : "Сценариев пока нет."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-line bg-white/[0.03] p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex h-[60svh] min-h-[320px] flex-col overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/20 p-4 sm:h-[68svh] sm:p-5 lg:h-[720px]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/55">История выполнения</h3>
                <p className="mt-1 text-xs text-white/35">Last heartbeat: {getRelativeHeartbeatLabel(agent.lastHeartbeatAt)}</p>
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
                      <div className="mt-1 text-xs text-white/45">
                        {formatTaskTime(task.createdAt)} · {task.kind === "scenario" ? "Сценарий" : "Команда"}
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
                <p className="mt-1 text-sm text-white/55">Заполни параметры и запусти команду.</p>
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
              {placeholderInputs.map((item, index) => (
                <div key={item.token}>
                  <label className="mb-2 block text-sm text-white/60">{item.token}</label>
                  <input
                    value={item.value}
                    onChange={(event) =>
                      setPlaceholderInputs((prev) =>
                        prev.map((current, currentIndex) =>
                          currentIndex === index ? { ...current, value: event.target.value.replace(/\s+/g, "") } : current,
                        ),
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === " ") {
                        event.preventDefault();
                      }
                    }}
                    placeholder={`Значение для ${item.token}`}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25"
                  />
                  <div className="mt-2 text-xs text-white/35">Без пробелов.</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleSubmitPlaceholderCommand}
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
                      onClick={() => setDraftStatusFilter(item.value as "all" | "queued" | "success" | "running" | "error")}
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
