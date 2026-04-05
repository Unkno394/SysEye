"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Play, TerminalSquare } from "lucide-react";
import { apiJson } from "@/lib/api-client";
import type { AgentDto, AgentStatus, AgentTaskDto, CommandDto, ExecutionLogDto, PagedResult, ScenarioDetailsDto, ScenarioDto, TaskExecutionDto, TaskStatus } from "@/lib/backend-types";
import { getAgentStatus, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { useClientRealtime } from "@/lib/client-realtime";
import { buildDiagnosticComparisons, DIAGNOSTIC_INTERRUPTED_NOTE, DIAGNOSTIC_SUMMARY_TEXT, DIAGNOSTIC_SUMMARY_TITLE, isIgnoredComparisonStatus } from "@/lib/diagnostics";
import type { DiagnosticComparisonItem } from "@/lib/diagnostics";
import { buildExecutionSummary, createOptimisticExecution, extractPlaceholderTokens, getPlaceholderIndex, isExecutionTerminalStatus, mapExecutionToHistoryItem, type ExecutionHistoryItem } from "@/lib/execution-history";
import { joinExecutionLogMessages, matchesExecutionLogRegex, mergeExecutionLogs } from "@/lib/execution-logs";
import { ensureServerAgentOs } from "@/lib/local-agent-runtime";
import { GlassCard, SectionTitle, StatusBadge } from "@/components/ui";

const OPTIMISTIC_EXECUTION_TTL_MS = 2 * 60 * 1000;

type TerminalTask = {
  id: string;
  commandId: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string | null;
  durationSeconds?: number | null;
  exitCode?: number | null;
  summary: string;
  rawOutput?: string;
  rawError?: string;
  kind: "command" | "scenario";
};

type ScenarioRun = {
  id: string;
  scenarioId: string;
  scenarioName: string;
  executionIds: string[];
  createdAt: string;
};

type PlaceholderInput = {
  index: number;
  token: string;
  label: string;
  value: string;
};

type CommandPlatformFilter = "all" | "linux" | "windows";
type ScenarioFilter = "all" | "ready" | "empty";
type HistoryStatusFilter = "all" | "sent" | "running" | "success" | "error" | "cancelled";
type ExtendedHistoryStatusFilter = HistoryStatusFilter | "interrupted";

type TerminalPanelProps = {
  agent: AgentDto;
  commands: CommandDto[];
  status?: AgentStatus;
};

function formatTaskTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 1) return `${value.toFixed(2)} сек`;
  if (value < 10) return `${value.toFixed(1)} сек`;
  return `${Math.round(value)} сек`;
}

function shouldShowExitCode(task: TerminalTask) {
  if (task.exitCode == null) return false;
  if (task.exitCode !== 0) return true;
  return task.status !== "success";
}

function canCancelTask(task: TerminalTask) {
  return task.status === "queued" || task.status === "running";
}

function buildTaskLog(task: TerminalTask) {
  const stdout = String(task.rawOutput ?? "").trim();
  const stderr = String(task.rawError ?? "").trim();

  if (!stdout && !stderr) {
    return "";
  }

  if (stdout && stderr) {
    return [`stdout:\n${stdout}`, `stderr:\n${stderr}`].join("\n\n");
  }

  if (stderr) {
    return `stderr:\n${stderr}`;
  }

  return stdout;
}

function resolveCommandForAgent(item: CommandDto, agent: AgentDto) {
  if (agent.os === 2) {
    return item.powerShellScript || item.bashScript || "";
  }

  return item.bashScript || item.powerShellScript || "";
}

function matchesCommandPlatform(command: CommandDto, filter: CommandPlatformFilter) {
  if (filter === "all") return true;

  const hasBash = Boolean(command.bashScript?.trim());
  const hasPowerShell = Boolean(command.powerShellScript?.trim());

  if (filter === "linux") return hasBash;
  return hasPowerShell;
}

function normalizeExecutionIds(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  return [];
}

function getComparisonTone(state: "no-data" | "no-baseline" | "unchanged" | "changed" | "ignored") {
  switch (state) {
    case "changed":
      return "border-amber-400/20 bg-amber-400/10 text-amber-100";
    case "unchanged":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    case "ignored":
      return "border-white/10 bg-white/[0.04] text-white/70";
    default:
      return "border-white/10 bg-white/[0.03] text-white/65";
  }
}

function getComparisonLabel(state: "no-data" | "no-baseline" | "unchanged" | "changed" | "ignored") {
  switch (state) {
    case "changed":
      return "Изменилось";
    case "unchanged":
      return "Без изменений";
    case "ignored":
      return "Пропущено";
    case "no-baseline":
      return "Нет базы";
    default:
      return "Нет данных";
  }
}

function getComparisonDetails(item: DiagnosticComparisonItem) {
  const lines: string[] = [];

  if (item.comparisonState === "changed") {
    lines.push(
      ...item.addedLines.slice(0, 2).map((line) => `+ ${line}`),
      ...item.removedLines.slice(0, 2).map((line) => `- ${line}`),
    );
  } else if (item.comparisonState === "unchanged") {
    lines.push("Последние успешные запуски совпадают.");
  } else if (item.comparisonState === "ignored") {
    lines.push("Последний запуск был прерван, успешной базы для сравнения пока нет.");
  } else if (item.comparisonState === "no-baseline") {
    lines.push("Нужен ещё один успешный запуск для сравнения.");
  } else {
    lines.push("Ещё нет успешных запусков для сравнения.");
  }

  if (item.comparisonState !== "ignored" && isIgnoredComparisonStatus(item.latestAttemptStatus)) {
    lines.push("Последний прерванный запуск пропущен и не участвует в сравнении.");
  }

  return lines;
}

export function TerminalPanel({ agent, commands, status }: TerminalPanelProps) {
  const [serverExecutions, setServerExecutions] = useState<TaskExecutionDto[]>([]);
  const [loadedScenarios, setLoadedScenarios] = useState<ScenarioDetailsDto[]>([]);
  const [scenarioRuns, setScenarioRuns] = useState<ScenarioRun[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExtendedHistoryStatusFilter>("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<ExtendedHistoryStatusFilter>("all");
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
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [executionLogsByTaskId, setExecutionLogsByTaskId] = useState<Record<string, ExecutionLogDto[]>>({});
  const [regexLogsByTaskId, setRegexLogsByTaskId] = useState<Record<string, ExecutionLogDto[]>>({});
  const [loadingLogsTaskIds, setLoadingLogsTaskIds] = useState<string[]>([]);
  const optimisticExecutionDeadlinesRef = useRef<Record<string, number>>({});
  const scheduledReloadTimeoutIdsRef = useRef<number[]>([]);
  const realtimeReloadTimeoutRef = useRef<number | null>(null);
  const loadTasksRequestIdRef = useRef(0);
  const panelStatus = status ?? getAgentStatus(agent.lastHeartbeatAt);
  const isAgentOnline = panelStatus === "online";
  const commandsById = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands]);

  const scheduleTasksReload = () => {
    if (typeof window === "undefined") {
      return;
    }

    const firstTimeoutId = window.setTimeout(() => {
      void loadTasks();
    }, 1_200);
    const secondTimeoutId = window.setTimeout(() => {
      void loadTasks();
    }, 4_000);

    scheduledReloadTimeoutIdsRef.current = [
      ...scheduledReloadTimeoutIdsRef.current,
      firstTimeoutId,
      secondTimeoutId,
    ];
  };

  const scheduleRealtimeTasksReload = (delay = 600) => {
    if (typeof window === "undefined") {
      return;
    }

    if (realtimeReloadTimeoutRef.current !== null) {
      window.clearTimeout(realtimeReloadTimeoutRef.current);
    }

    realtimeReloadTimeoutRef.current = window.setTimeout(() => {
      realtimeReloadTimeoutRef.current = null;
      void loadTasks();
    }, delay);
  };

  const pushOptimisticTask = (executionId: string, commandId: string) => {
    const normalizedExecutionId = executionId.trim();
    if (!normalizedExecutionId) {
      return;
    }

    const title = commandsById.get(commandId)?.name?.trim() || `Команда ${commandId.slice(0, 8)}`;
    const optimisticTask = createOptimisticExecution({
      id: normalizedExecutionId,
      agentId: agent.id,
      commandId,
      title,
    });
    optimisticExecutionDeadlinesRef.current = {
      ...optimisticExecutionDeadlinesRef.current,
      [normalizedExecutionId]: Date.now() + OPTIMISTIC_EXECUTION_TTL_MS,
    };

    setServerExecutions((current) => [optimisticTask, ...current.filter((item) => item.id !== normalizedExecutionId)]);
  };

  const mergeLoadedExecutions = useCallback((loadedExecutions: TaskExecutionDto[]) => {
    const now = Date.now();
    const optimisticDeadlines = optimisticExecutionDeadlinesRef.current;
    const loadedExecutionIds = new Set(loadedExecutions.map((execution) => execution.id));

    setServerExecutions((current) => {
      const preservedOptimisticExecutions = current.filter((execution) => {
        const optimisticDeadline = optimisticDeadlines[execution.id];
        if (!optimisticDeadline || optimisticDeadline <= now) {
          return false;
        }

        return !loadedExecutionIds.has(execution.id);
      });

      return [...loadedExecutions, ...preservedOptimisticExecutions];
    });

    optimisticExecutionDeadlinesRef.current = Object.fromEntries(
      Object.entries(optimisticDeadlines).filter(([executionId, optimisticDeadline]) => (
        optimisticDeadline > now && !loadedExecutionIds.has(executionId)
      )),
    );
  }, []);

  const patchExecutionFromRealtime = (task: AgentTaskDto) => {
    const executionId = String(task.id ?? "").trim();
    if (!executionId) {
      return;
    }

    setServerExecutions((current) => {
      const currentExecution = current.find((execution) => execution.id === executionId);
      if (!currentExecution) {
        return current;
      }

      const nextStatus = task.status ?? currentExecution.status;
      const currentIsTerminal = isExecutionTerminalStatus(currentExecution.status);
      const nextIsTerminal = isExecutionTerminalStatus(nextStatus);
      if (currentIsTerminal && !nextIsTerminal) {
        return current;
      }

      const nextExecution: TaskExecutionDto = {
        ...currentExecution,
        title: String(task.title ?? "").trim() || currentExecution.title,
        startedAt: currentExecution.startedAt || task.createdAt,
        status: nextStatus,
        completedAt: nextIsTerminal
          ? currentExecution.completedAt ?? new Date().toISOString()
          : null,
        exitCode: task.exitCode ?? currentExecution.exitCode ?? null,
        resultSummary: "",
        rawOutput: task.output ?? currentExecution.rawOutput ?? "",
        rawError: task.error ?? currentExecution.rawError ?? "",
      };

      nextExecution.resultSummary = buildExecutionSummary(nextExecution);

      return [nextExecution, ...current.filter((execution) => execution.id !== executionId)];
    });
  };

  const loadTasks = useCallback(async () => {
    const requestId = ++loadTasksRequestIdRef.current;

    try {
      const data = await apiJson<PagedResult<TaskExecutionDto>>(
        `/api/hackaton/task/agents/${agent.id}?take=50&skip=0`,
        { method: "GET" },
      );

      if (requestId !== loadTasksRequestIdRef.current) {
        return;
      }

      mergeLoadedExecutions(data.items ?? []);
    } catch {
      return;
    }
  }, [agent.id, mergeLoadedExecutions]);

  const loadScenarios = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadTasks();
    void loadScenarios();
    const intervalId = window.setInterval(() => {
      void loadTasks();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
      scheduledReloadTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      scheduledReloadTimeoutIdsRef.current = [];
      if (realtimeReloadTimeoutRef.current !== null) {
        window.clearTimeout(realtimeReloadTimeoutRef.current);
        realtimeReloadTimeoutRef.current = null;
      }
    };
  }, [loadScenarios, loadTasks]);

  const tasks = useMemo(() => {
    return [...serverExecutions]
      .map((execution) => mapExecutionToHistoryItem(execution, commandsById))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [commandsById, serverExecutions]);
  const diagnosticComparisons = useMemo(
    () => buildDiagnosticComparisons(serverExecutions, commandsById),
    [commandsById, serverExecutions],
  );
  const changedDiagnosticCount = useMemo(
    () => diagnosticComparisons.filter((item) => item.comparisonState === "changed").length,
    [diagnosticComparisons],
  );
  const ignoredDiagnosticCount = useMemo(
    () => diagnosticComparisons.filter((item) => isIgnoredComparisonStatus(item.latestAttemptStatus)).length,
    [diagnosticComparisons],
  );
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const expandedExecutionIds = useMemo(() => expandedTaskIds.filter(Boolean), [expandedTaskIds]);

  useClientRealtime(
    {
      onTaskQueued: ({ agentId, task }) => {
        if (agentId === agent.id) {
          patchExecutionFromRealtime(task);
          scheduleRealtimeTasksReload();
        }
      },
      onTaskUpdated: ({ agentId, task }) => {
        if (agentId === agent.id) {
          patchExecutionFromRealtime(task);
          if (isExecutionTerminalStatus(task.status)) {
            scheduleRealtimeTasksReload(250);
          }
        }
      },
      onExecutionLogReceived: (entry) => {
        const executionId = String(entry.executionId ?? "").trim();
        if (!executionId || !expandedExecutionIds.includes(executionId)) {
          return;
        }

        setExecutionLogsByTaskId((current) => ({
          ...current,
          [executionId]: mergeExecutionLogs(current[executionId] ?? [], [entry]),
        }));

        const task = taskById.get(executionId);
        const command = task ? commandsById.get(task.commandId) : null;
        if (command?.logRegex?.trim() && matchesExecutionLogRegex(entry.message, command.logRegex)) {
          setRegexLogsByTaskId((current) => ({
            ...current,
            [executionId]: mergeExecutionLogs(current[executionId] ?? [], [entry]),
          }));
        }
      },
      executionIds: expandedExecutionIds,
    },
    Boolean(agent.id),
  );

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

  const scenarioProgressItems = useMemo(() => {
    return scenarioRuns.map((run) => {
      const relatedTasks = run.executionIds
        .map((executionId) => taskById.get(executionId))
        .filter((task): task is ExecutionHistoryItem => Boolean(task));
      const completedSteps = relatedTasks.filter((task) => isExecutionTerminalStatus(task.status)).length;
      const runningSteps = relatedTasks.filter((task) => task.status === "running").length;
      const failedSteps = relatedTasks.filter((task) => task.status === "error" || task.status === "cancelled" || task.status === "interrupted").length;
      const totalSteps = run.executionIds.length;
      const allCompleted = totalSteps > 0 && completedSteps >= totalSteps;

      return {
        ...run,
        completedSteps,
        runningSteps,
        failedSteps,
        totalSteps,
        allCompleted,
      };
    }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [scenarioRuns, taskById]);

  const executeTemplateCommand = async (commandId: string, values: Record<number, string>) => {
    setRuntimeNotice(null);

    if (!isAgentOnline) {
      setRuntimeNotice("Агент оффлайн. Дождись реального heartbeat, потом запускай команду.");
      return;
    }

    try {
      await ensureServerAgentOs(agent);
      const response = await apiJson<unknown>(
        `/api/hackaton/task/agents/${agent.id}/execute`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId,
            placeholderValues: values,
          }),
        },
        "Не удалось запустить шаблонную команду.",
      );

      const executionIds = normalizeExecutionIds(response);
      const commandName = commandsById.get(commandId)?.name?.trim() || `Команда ${commandId.slice(0, 8)}`;

      executionIds.forEach((executionId) => {
        pushOptimisticTask(executionId, commandId);
      });

      setRuntimeNotice(`Команда "${commandName}" поставлена в очередь.`);
      scheduleTasksReload();
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : "Не удалось запустить шаблонную команду.");
    }
  };

  const executeScenario = async (scenarioId: string) => {
    if (!isAgentOnline) {
      setRuntimeNotice("Агент оффлайн. Сценарий не стартует, пока машина не пришлёт heartbeat.");
      return;
    }

    const scenario = loadedScenarios.find((item) => item.id === scenarioId);
    if (!scenario) {
      setRuntimeNotice("Сценарий не найден.");
      return;
    }

    const runnableCommands = (scenario.commands ?? [])
      .map((step) => commandsById.get(step.commandId))
      .filter((command): command is CommandDto => Boolean(command))
      .filter((command) => {
        const resolvedCommand = resolveCommandForAgent(command, agent);
        return Boolean(resolvedCommand.trim()) && extractPlaceholderTokens(resolvedCommand).length === 0;
      });

    if (!runnableCommands.length) {
      setRuntimeNotice(`В сценарии "${scenario.name}" нет шагов, которые можно сразу отправить на этого агента.`);
      return;
    }

    setRuntimeNotice(null);

    try {
      await ensureServerAgentOs(agent);
      const response = await apiJson<unknown>(
        `/api/hackaton/task/agents/${agent.id}/scenario`,
        {
          method: "POST",
          body: JSON.stringify({
            scenarioId,
          }),
        },
        "Не удалось запустить сценарий.",
      );

      const executionIds = normalizeExecutionIds(response);
      const queuedCommands = (scenario.commands ?? [])
        .map((step) => commandsById.get(step.commandId))
        .filter((command): command is CommandDto => Boolean(command));

      executionIds.forEach((executionId, index) => {
        const command = queuedCommands[index];
        if (command) {
          pushOptimisticTask(executionId, command.id);
        }
      });

      if (executionIds.length) {
        setScenarioRuns((current) => [
          {
            id: `${scenarioId}:${executionIds[0]}`,
            scenarioId,
            scenarioName: scenario.name,
            executionIds,
            createdAt: new Date().toISOString(),
          },
          ...current.filter((item) => item.scenarioId !== scenarioId || item.executionIds.join("|") !== executionIds.join("|")),
        ].slice(0, 12));
      }

      setRuntimeNotice(`Сценарий "${scenario.name}" поставлен в очередь: ${runnableCommands.length} шагов.`);
      scheduleTasksReload();
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : "Не удалось запустить сценарий.");
    }
  };

  const handleCommandClick = (item: CommandDto) => {
    if (!isAgentOnline) {
      setRuntimeNotice("Агент оффлайн. Новые команды сейчас не отправляются.");
      return;
    }

    const resolvedCommand = resolveCommandForAgent(item, agent);
    if (!resolvedCommand.trim()) {
      setRuntimeNotice(`Для агента ${agent.name} у команды "${item.name}" нет подходящего скрипта под текущую платформу.`);
      return;
    }

    const tokens = extractPlaceholderTokens(resolvedCommand);

    if (!tokens.length) {
      void executeTemplateCommand(item.id, {});
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
    void executeScenario(scenarioId);
  };

  const loadExecutionLogs = async (task: TerminalTask) => {
    if (loadingLogsTaskIds.includes(task.id)) {
      return;
    }

    setLoadingLogsTaskIds((current) => [...current, task.id]);

    try {
      const logs = await apiJson<ExecutionLogDto[]>(
        `/api/hackaton/logs/executions/${task.id}?limit=200`,
        { method: "GET" },
        "Не удалось загрузить лог выполнения.",
      );

      setExecutionLogsByTaskId((current) => ({
        ...current,
        [task.id]: mergeExecutionLogs(current[task.id] ?? [], logs ?? []),
      }));

      const command = commandsById.get(task.commandId);
      if (command?.logRegex?.trim()) {
        try {
          const regexLogs = await apiJson<ExecutionLogDto[]>(
            `/api/hackaton/logs/executions/${task.id}/regex?limit=200`,
            { method: "GET" },
            "Не удалось загрузить regex-логи.",
          );

          setRegexLogsByTaskId((current) => ({
            ...current,
            [task.id]: mergeExecutionLogs(current[task.id] ?? [], regexLogs ?? []),
          }));
        } catch {
          setRegexLogsByTaskId((current) => ({
            ...current,
            [task.id]: [],
          }));
        }
      }
    } catch {
      setExecutionLogsByTaskId((current) => ({
        ...current,
        [task.id]: [],
      }));
    } finally {
      setLoadingLogsTaskIds((current) => current.filter((item) => item !== task.id));
    }
  };

  const toggleTaskLogs = (task: TerminalTask) => {
    const isExpanded = expandedTaskIds.includes(task.id);

    setExpandedTaskIds((current) =>
      isExpanded ? current.filter((item) => item !== task.id) : [...current, task.id],
    );

    if (!isExpanded && executionLogsByTaskId[task.id] === undefined) {
      void loadExecutionLogs(task);
    }
  };

  const buildHttpLog = (task: TerminalTask) => {
    const logs = executionLogsByTaskId[task.id] ?? [];
    if (!logs.length) {
      return "";
    }

    return joinExecutionLogMessages(logs);
  };

  const buildRegexLog = (task: TerminalTask) => {
    const logs = regexLogsByTaskId[task.id] ?? [];
    if (!logs.length) {
      return "";
    }

    return joinExecutionLogMessages(logs);
  };

  const cancelTask = async (task: TerminalTask) => {
    try {
      await apiJson<void>(
        `/api/hackaton/task/executions/${task.id}/cancel`,
        { method: "POST" },
        "Не удалось прервать выполнение.",
      );

      delete optimisticExecutionDeadlinesRef.current[task.id];
      setServerExecutions((current) => current.map((execution) => {
        if (execution.id !== task.id) {
          return execution;
        }

        const nextExecution: TaskExecutionDto = {
          ...execution,
          status: "cancelled",
          completedAt: execution.completedAt ?? new Date().toISOString(),
          resultSummary: "",
          rawError: execution.rawError || "command cancelled by user",
        };

        nextExecution.resultSummary = buildExecutionSummary(nextExecution);
        return nextExecution;
      }));
      setRuntimeNotice(`Команда "${task.title}" отменена.`);
      void loadTasks();
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : "Не удалось прервать выполнение.");
    }
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
        setPlaceholderError(error instanceof Error ? error.message : "Не удалось запустить команду.");
      }
    })();
  };

  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <SectionTitle
          title="Запуск команд"
          subtitle="Сохранённые команды, библиотека сценариев и история выполнений нового backend."
          action={
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
              <StatusBadge status={panelStatus} />
              <span>{panelStatus === "online" ? "Online" : "Offline"}</span>
            </div>
          }
        />
        {runtimeNotice ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/90">
            {runtimeNotice}
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
                const resolvedCommand = resolveCommandForAgent(item, agent);
                const hasPlaceholders = extractPlaceholderTokens(resolvedCommand).length > 0;
                const isRunnable = Boolean(resolvedCommand.trim());
                const isStartDisabled = !isRunnable || !isAgentOnline;
                const availabilityText = !isAgentOnline
                  ? "Агент оффлайн. Запуск станет доступен после heartbeat"
                  : isRunnable
                    ? (hasPlaceholders ? "Нужны параметры перед запуском" : "Готова к запуску")
                    : "Нет скрипта под текущую платформу";

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isStartDisabled}
                    onClick={() => handleCommandClick(item)}
                    className={`w-[280px] shrink-0 rounded-2xl border p-3 text-left transition sm:w-[300px] ${
                      !isStartDisabled
                        ? "border-white/8 bg-black/20 hover:border-line hover:bg-white/[0.04]"
                        : "cursor-not-allowed border-amber-500/20 bg-amber-500/5 opacity-75"
                    }`}
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
                      <span className="text-xs text-white/40">{availabilityText}</span>
                      <span className={`inline-flex items-center gap-1 text-xs ${!isStartDisabled ? "text-accent" : "text-white/30"}`}>
                        <Play size={12} />
                        {!isAgentOnline ? "Оффлайн" : isRunnable ? "Запустить" : "Недоступно"}
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
              {visibleScenarios.map((scenario) => {
                const isScenarioDisabled = !isAgentOnline;

                return (
                  <button
                    key={scenario.id}
                    type="button"
                    disabled={isScenarioDisabled}
                    onClick={() => handleScenarioClick(scenario.id)}
                    className={`w-[280px] shrink-0 rounded-2xl border p-3 text-left transition sm:w-[300px] ${
                      isScenarioDisabled
                        ? "cursor-not-allowed border-amber-500/20 bg-amber-500/5 opacity-75"
                        : "border-white/8 bg-black/20 hover:border-amber-400/20 hover:bg-white/[0.04]"
                    }`}
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
                    <div className={`mt-3 inline-flex items-center gap-1 text-xs ${isScenarioDisabled ? "text-white/30" : "text-amber-200"}`}>
                      <Play size={12} />
                      {isScenarioDisabled ? "Агент оффлайн" : "Запустить сценарий"}
                    </div>
                  </button>
                );
              })}
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
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
                        <span>{formatTaskTime(task.createdAt)} · Команда</span>
                        {task.durationSeconds != null ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
                            {formatDuration(task.durationSeconds)}
                          </span>
                        ) : null}
                        {shouldShowExitCode(task) ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
                            код {task.exitCode}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <StatusBadge status={task.status} />
                      {canCancelTask(task) ? (
                        <button
                          type="button"
                          onClick={() => void cancelTask(task)}
                          className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100/90 transition hover:bg-rose-400/15"
                        >
                          Прервать
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/8 bg-[#081018] p-3 text-sm text-white/80 break-words whitespace-pre-wrap">
                    {task.summary}
                  </div>
                  {buildTaskLog(task) || executionLogsByTaskId[task.id] !== undefined || commandsById.get(task.commandId)?.logRegex ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => toggleTaskLogs(task)}
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65 transition hover:text-white"
                      >
                        {expandedTaskIds.includes(task.id) ? "Скрыть лог" : "Развернуть лог"}
                      </button>
                      {expandedTaskIds.includes(task.id) ? (
                        <div className="mt-3 space-y-3">
                          {loadingLogsTaskIds.includes(task.id) ? (
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-3 text-xs text-white/55">
                              Загрузка логов...
                            </div>
                          ) : null}
                          {buildHttpLog(task) ? (
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-3 font-mono text-xs text-[#9af7c8] break-words whitespace-pre-wrap">
                              {buildHttpLog(task)}
                            </div>
                          ) : buildTaskLog(task) ? (
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-3 font-mono text-xs text-[#9af7c8] break-words whitespace-pre-wrap">
                              {buildTaskLog(task)}
                            </div>
                          ) : null}
                          {buildRegexLog(task) ? (
                            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
                              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-amber-200/80">Regex matches</div>
                              <div className="font-mono text-xs text-amber-100 break-words whitespace-pre-wrap">
                                {buildRegexLog(task)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}

              {!filteredTasks.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                  История пока пустая.
                </div>
              ) : null}

              {scenarioProgressItems.length ? (
                <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.07] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Прогресс сценариев</div>
                  <div className="mt-3 space-y-2">
                    {scenarioProgressItems.slice(0, 4).map((run) => (
                      <div key={run.id} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{run.scenarioName}</div>
                            <div className="mt-1 text-xs text-white/45">
                              {formatTaskTime(run.createdAt)} · {run.completedSteps}/{run.totalSteps} шагов прошло
                            </div>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60">
                            {run.allCompleted ? "Готово" : run.runningSteps ? "Выполняется" : "В очереди"}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/8 bg-white/[0.04]">
                          <div
                            className={`h-full rounded-full ${run.failedSteps ? "bg-rose-300" : run.allCompleted ? "bg-emerald-300" : "bg-amber-200"}`}
                            style={{ width: `${run.totalSteps ? Math.max(6, (run.completedSteps / run.totalSteps) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">{DIAGNOSTIC_SUMMARY_TITLE}</div>
                <div className="mt-2 text-xs text-white/65">{DIAGNOSTIC_SUMMARY_TEXT}</div>
                <div className="mt-2 text-[11px] text-white/50">{DIAGNOSTIC_INTERRUPTED_NOTE}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60">
                    {changedDiagnosticCount ? `Изменений: ${changedDiagnosticCount}` : "Изменений пока нет"}
                  </span>
                  {ignoredDiagnosticCount ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
                      Пропущено прерванных: {ignoredDiagnosticCount}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                {diagnosticComparisons.slice(0, 6).map((item) => (
                  <div key={item.command.id} className={`rounded-2xl border p-3 ${getComparisonTone(item.comparisonState)}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{item.command.name}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em]">
                        {getComparisonLabel(item.comparisonState)}
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs leading-5">
                      {getComparisonDetails(item).map((line, index) => (
                        <div key={`${item.command.id}-${index}`} className="break-words">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {!diagnosticComparisons.length ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-xs text-white/45">
                    Для сравнения пока нет базовых диагностических запусков.
                  </div>
                ) : null}
              </div>
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
                      { value: "sent", label: "Отправлена" },
                      { value: "running", label: "В работе" },
                      { value: "success", label: "Успех" },
                      { value: "error", label: "Ошибка" },
                      { value: "cancelled", label: "Отменена" },
                      { value: "interrupted", label: "Прервана" },
                    ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setDraftStatusFilter(item.value as ExtendedHistoryStatusFilter)}
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
