"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Play, TerminalSquare, Users } from "lucide-react";
import { apiJson } from "@/lib/api-client";
import type { AgentDto, AgentTaskDto, CommandDto, ExecutionLogDto, PagedResult, ScenarioDetailsDto, ScenarioDto, TaskExecutionDto, TaskStatus } from "@/lib/backend-types";
import { getAgentStatus, getOsLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { useClientRealtime } from "@/lib/client-realtime";
import { buildExecutionSummary, createOptimisticExecution, extractPlaceholderTokens, getPlaceholderIndex, isExecutionTerminalStatus, mapExecutionToHistoryItem } from "@/lib/execution-history";
import { joinExecutionLogMessages, matchesExecutionLogRegex, mergeExecutionLogs } from "@/lib/execution-logs";
import { ensureServerAgentOs } from "@/lib/local-agent-runtime";
import { GlassCard, SectionTitle, StatusBadge } from "@/components/ui";

const OPTIMISTIC_TASK_TTL_MS = 2 * 60 * 1000;

type GroupTask = {
  id: string;
  agentId: string;
  agentName: string;
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

function formatDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 1) return `${value.toFixed(2)} сек`;
  if (value < 10) return `${value.toFixed(1)} сек`;
  return `${Math.round(value)} сек`;
}

function shouldShowExitCode(task: GroupTask) {
  if (task.exitCode == null) return false;
  if (task.exitCode !== 0) return true;
  return task.status !== "success";
}

function canCancelTask(task: GroupTask) {
  return task.status === "queued" || task.status === "running";
}

function buildTaskLog(task: GroupTask) {
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

function isUnavailableCommand(script: string) {
  const normalized = script.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return normalized === "unavailable";
}

function getCommandAvailability(item: CommandDto, agent: AgentDto) {
  const resolvedCommand = resolveCommandForAgent(item, agent).trim();

  if (!resolvedCommand) {
    return {
      resolvedCommand,
      runnable: false,
      statusText: `Нет скрипта для ${getOsLabel(agent.os)}`,
    };
  }

  if (isUnavailableCommand(resolvedCommand)) {
    return {
      resolvedCommand,
      runnable: false,
      statusText: `Недоступно для ${getOsLabel(agent.os)}`,
    };
  }

  return {
    resolvedCommand,
    runnable: true,
    statusText: "Готова к запуску",
  };
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
  const [actionNotice, setActionNotice] = useState<ActionNotice>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [executionLogsByTaskId, setExecutionLogsByTaskId] = useState<Record<string, ExecutionLogDto[]>>({});
  const [regexLogsByTaskId, setRegexLogsByTaskId] = useState<Record<string, ExecutionLogDto[]>>({});
  const [loadingLogsTaskIds, setLoadingLogsTaskIds] = useState<string[]>([]);
  const optimisticTaskDeadlinesRef = useRef<Record<string, number>>({});
  const commandsById = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands]);
  const onlineAgents = useMemo(
    () => agents.filter((agent) => getAgentStatus(agent.lastHeartbeatAt) === "online"),
    [agents],
  );

  const scheduleTasksReload = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.setTimeout(() => {
      void loadTasks();
    }, 1_200);
    window.setTimeout(() => {
      void loadTasks();
    }, 4_000);
  };

  const pushOptimisticTask = (agent: AgentDto, executionId: string, commandId: string) => {
    const normalizedExecutionId = executionId.trim();
    if (!normalizedExecutionId) {
      return;
    }

    const title = commandsById.get(commandId)?.name?.trim() || `Команда ${commandId.slice(0, 8)}`;
    const task = {
      ...mapExecutionToHistoryItem(
        createOptimisticExecution({
          id: normalizedExecutionId,
          agentId: agent.id,
          commandId,
          title,
        }),
        commandsById,
        agent.name,
      ),
      id: `${agent.id}:${normalizedExecutionId}`,
      agentName: agent.name,
    };
    optimisticTaskDeadlinesRef.current = {
      ...optimisticTaskDeadlinesRef.current,
      [task.id]: Date.now() + OPTIMISTIC_TASK_TTL_MS,
    };

    setServerTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
  };

  const mergeLoadedTasks = (loadedTasks: GroupTask[], successfulAgentIds: Set<string>) => {
    const now = Date.now();
    const optimisticTaskDeadlines = optimisticTaskDeadlinesRef.current;
    const loadedTaskIds = new Set(loadedTasks.map((task) => task.id));
    const trackedAgentIds = new Set(agents.map((agent) => agent.id));

    setServerTasks((current) => {
      const preservedTasks = current.filter((task) => {
        if (!trackedAgentIds.has(task.agentId)) {
          return false;
        }

        if (loadedTaskIds.has(task.id)) {
          return false;
        }

        const optimisticDeadline = optimisticTaskDeadlines[task.id];
        if (optimisticDeadline && optimisticDeadline > now) {
          return true;
        }

        return !successfulAgentIds.has(task.agentId);
      });

      return [...loadedTasks, ...preservedTasks];
    });

    optimisticTaskDeadlinesRef.current = Object.fromEntries(
      Object.entries(optimisticTaskDeadlines).filter(([taskId, optimisticDeadline]) => (
        optimisticDeadline > now && !loadedTaskIds.has(taskId)
      )),
    );
  };

  const patchTaskFromRealtime = (agentId: string, task: AgentTaskDto) => {
    const executionId = String(task.id ?? "").trim();
    if (!executionId) {
      return;
    }

    const taskId = `${agentId}:${executionId}`;

    setServerTasks((current) => {
      const currentTask = current.find((item) => item.id === taskId);
      if (!currentTask) {
        return current;
      }

      const nextStatus = task.status ?? currentTask.status;
      const currentIsTerminal = isExecutionTerminalStatus(currentTask.status);
      const nextIsTerminal = isExecutionTerminalStatus(nextStatus);
      if (currentIsTerminal && !nextIsTerminal) {
        return current;
      }

      const nextTask: GroupTask = {
        ...currentTask,
        title: String(task.title ?? "").trim() || currentTask.title,
        status: nextStatus,
        completedAt: nextIsTerminal
          ? currentTask.completedAt ?? new Date().toISOString()
          : null,
        exitCode: task.exitCode ?? currentTask.exitCode ?? null,
        rawOutput: task.output ?? currentTask.rawOutput ?? "",
        rawError: task.error ?? currentTask.rawError ?? "",
      };

      nextTask.summary = buildExecutionSummary({
        id: executionId,
        agentId,
        commandId: currentTask.commandId,
        title: nextTask.title,
        startedAt: currentTask.createdAt,
        status: nextTask.status,
        completedAt: nextTask.completedAt,
        durationSeconds: nextTask.durationSeconds,
        exitCode: nextTask.exitCode,
        resultSummary: "",
        rawOutput: nextTask.rawOutput,
        rawError: nextTask.rawError,
      });

      return [nextTask, ...current.filter((item) => item.id !== taskId)];
    });
  };

  const loadTasks = async () => {
    if (!agents.length) {
      setServerTasks([]);
      return;
    }

    const commandsById = new Map(commands.map((command) => [command.id, command]));
    const taskGroups = await Promise.all(
      agents.map(async (agent) => {
        try {
          const executions = await apiJson<PagedResult<TaskExecutionDto>>(
            `/api/hackaton/task/agents/${agent.id}?take=20&skip=0`,
            { method: "GET" },
          );

          return {
            agentId: agent.id,
            tasks: (executions.items ?? []).map((execution) => ({
            ...mapExecutionToHistoryItem(
              execution,
              commandsById,
              agent.name,
            ),
            id: `${agent.id}:${execution.id}`,
            agentName: agent.name,
            })),
          };
        } catch {
          return {
            agentId: agent.id,
            tasks: null,
          };
        }
      }),
    );

    const successfulAgentIds = new Set(taskGroups.filter((group) => Array.isArray(group.tasks)).map((group) => group.agentId));
    const loadedTasks = taskGroups.flatMap((group) => group.tasks ?? []);
    mergeLoadedTasks(loadedTasks, successfulAgentIds);
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
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agents, commands]);

  const trackedAgentIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents]);

  const tasks = useMemo(() => {
    return [...serverTasks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [serverTasks]);
  const taskIdByExecutionId = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      const executionId = task.id.includes(":") ? task.id.split(":")[1] : task.id;
      map.set(executionId, task.id);
    }
    return map;
  }, [tasks]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const expandedExecutionIds = useMemo(
    () => expandedTaskIds.map((taskId) => (taskId.includes(":") ? taskId.split(":")[1] : taskId)).filter(Boolean),
    [expandedTaskIds],
  );

  useClientRealtime({
    onTaskQueued: ({ agentId, task }) => {
      if (trackedAgentIds.has(agentId)) {
        patchTaskFromRealtime(agentId, task);
        void loadTasks();
      }
    },
    onTaskUpdated: ({ agentId, task }) => {
      if (trackedAgentIds.has(agentId)) {
        patchTaskFromRealtime(agentId, task);
        void loadTasks();
      }
    },
    onExecutionLogReceived: (entry) => {
      const executionId = String(entry.executionId ?? "").trim();
      const taskId = taskIdByExecutionId.get(executionId);
      if (!executionId || !taskId) {
        return;
      }

      setExecutionLogsByTaskId((current) => ({
        ...current,
        [taskId]: mergeExecutionLogs(current[taskId] ?? [], [entry]),
      }));

      const task = taskById.get(taskId);
      const command = task ? commandsById.get(task.commandId) : null;
      if (command?.logRegex?.trim() && matchesExecutionLogRegex(entry.message, command.logRegex)) {
        setRegexLogsByTaskId((current) => ({
          ...current,
          [taskId]: mergeExecutionLogs(current[taskId] ?? [], [entry]),
        }));
      }
    },
    executionIds: expandedExecutionIds,
  }, agents.length > 0);

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
    const firstError = results.find((result) => result.status === "rejected");

    if (!successCount && firstError?.status === "rejected") {
      const reason = firstError.reason;
      setActionNotice({
        tone: "error",
        text: reason instanceof Error ? reason.message : `${label} не удалось выполнить.`,
      });
    } else {
      setActionNotice(buildBatchNotice(label, successCount, requests.length));
    }

    if (successCount > 0) {
      scheduleTasksReload();
    }

    return successCount > 0;
  };

  const queueCommandTask = async (item: CommandDto) => {
    const supportedAgents = onlineAgents.filter((agent) => getCommandAvailability(item, agent).runnable);
    if (!supportedAgents.length) {
      setActionNotice({
        tone: "error",
        text: onlineAgents.length
          ? `Команда "${item.name}" недоступна для online машин группы.`
          : "В группе нет online машин. Дождись реального heartbeat, потом запускай команды.",
      });
      return;
    }

    await runBatch(
      supportedAgents.map((agent) => {
        const command = getCommandAvailability(item, agent).resolvedCommand;

        return (async () => {
          await ensureServerAgentOs(agent);
          const response = await apiJson<unknown>(
            `/api/hackaton/task/agents/${agent.id}/execute`,
            {
              method: "POST",
              body: JSON.stringify({
                commandId: item.id,
                placeholderValues: {},
              }),
            },
          );
          normalizeExecutionIds(response).forEach((executionId) => {
            pushOptimisticTask(agent, executionId, item.id);
          });
          return response;
        })();
      }),
      "Запуск",
    );
  };

  const executeTemplateCommand = async (commandId: string, values: Record<number, string>) => {
    const command = commandsById.get(commandId);
    const supportedAgents = command
      ? onlineAgents.filter((agent) => getCommandAvailability(command, agent).runnable)
      : [];

    if (!supportedAgents.length) {
      setActionNotice({
        tone: "error",
        text: onlineAgents.length
          ? "Шаблонная команда недоступна для online машин группы."
          : "В группе нет online машин. Дождись реального heartbeat, потом запускай команды.",
      });
      return;
    }

    await runBatch(
      supportedAgents.map((agent) =>
        (async () => {
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
          );
          normalizeExecutionIds(response).forEach((executionId) => {
            pushOptimisticTask(agent, executionId, commandId);
          });
          return response;
        })(),
      ),
      "Шаблонный запуск",
    );
  };

  const handleCommandClick = (item: CommandDto) => {
    if (!onlineAgents.length) {
      setActionNotice({
        tone: "error",
        text: "В группе нет online машин. Команды сейчас не отправляются.",
      });
      return;
    }

    const tokens = Array.from(
      new Set(
        onlineAgents
          .filter((agent) => getCommandAvailability(item, agent).runnable)
          .flatMap((agent) => extractPlaceholderTokens(resolveCommandForAgent(item, agent))),
      ),
    ).sort((left, right) => getPlaceholderIndex(left) - getPlaceholderIndex(right));

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
    void (async () => {
      const scenario = loadedScenarios.find((item) => item.id === scenarioId);
      if (!scenario) {
        setActionNotice({ tone: "error", text: "Сценарий не найден." });
        return;
      }

      const supportedAgents = onlineAgents.filter((agent) =>
        (scenario.commands ?? []).some((step) => {
          const command = commandsById.get(step.commandId);
          if (!command) return false;
          const availability = getCommandAvailability(command, agent);
          return availability.runnable && extractPlaceholderTokens(availability.resolvedCommand).length === 0;
        }),
      );

      if (!supportedAgents.length) {
        setActionNotice({
          tone: "error",
          text: onlineAgents.length
            ? `В сценарии "${scenario.name}" нет шагов, которые можно сразу отправить на online машины.`
            : "В группе нет online машин. Сценарий не стартует без реального heartbeat.",
        });
        return;
      }

      const requests = supportedAgents.map(async (agent) => {
        await ensureServerAgentOs(agent);
        const response = await apiJson<unknown>(
          `/api/hackaton/task/agents/${agent.id}/scenario`,
          {
            method: "POST",
            body: JSON.stringify({
              scenarioId,
            }),
          },
        );

        const queuedCommands = (scenario.commands ?? [])
          .map((step) => commandsById.get(step.commandId))
          .filter((command): command is CommandDto => Boolean(command));

        normalizeExecutionIds(response).forEach((executionId, index) => {
          const command = queuedCommands[index];
          if (command) {
            pushOptimisticTask(agent, executionId, command.id);
          }
        });
      });

      await runBatch(requests, `Сценарий "${scenario.name}"`);
    })();
  };

  const loadExecutionLogs = async (task: GroupTask) => {
    if (loadingLogsTaskIds.includes(task.id)) {
      return;
    }

    const executionId = task.id.includes(":") ? task.id.split(":")[1] : task.id;
    setLoadingLogsTaskIds((current) => [...current, task.id]);

    try {
      const logs = await apiJson<ExecutionLogDto[]>(
        `/api/hackaton/logs/executions/${executionId}?limit=200`,
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
            `/api/hackaton/logs/executions/${executionId}/regex?limit=200`,
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

  const toggleTaskLogs = (task: GroupTask) => {
    const isExpanded = expandedTaskIds.includes(task.id);

    setExpandedTaskIds((current) =>
      isExpanded ? current.filter((item) => item !== task.id) : [...current, task.id],
    );

    if (!isExpanded && executionLogsByTaskId[task.id] === undefined) {
      void loadExecutionLogs(task);
    }
  };

  const buildHttpLog = (task: GroupTask) => {
    const logs = executionLogsByTaskId[task.id] ?? [];
    if (!logs.length) {
      return "";
    }

    return joinExecutionLogMessages(logs);
  };

  const buildRegexLog = (task: GroupTask) => {
    const logs = regexLogsByTaskId[task.id] ?? [];
    if (!logs.length) {
      return "";
    }

    return joinExecutionLogMessages(logs);
  };

  const cancelTask = async (task: GroupTask) => {
    const executionId = task.id.includes(":") ? task.id.split(":")[1] : task.id;

    try {
      await apiJson<void>(
        `/api/hackaton/task/executions/${executionId}/cancel`,
        { method: "POST" },
        "Не удалось прервать выполнение.",
      );

      delete optimisticTaskDeadlinesRef.current[task.id];
      setServerTasks((current) => current.map((item) => {
        if (item.id !== task.id) {
          return item;
        }

        const nextTask: GroupTask = {
          ...item,
          status: "cancelled",
          completedAt: item.completedAt ?? new Date().toISOString(),
          rawError: item.rawError || "command cancelled by user",
        };

        nextTask.summary = buildExecutionSummary({
          id: executionId,
          agentId: item.agentId,
          commandId: item.commandId,
          title: item.title,
          startedAt: item.createdAt,
          status: nextTask.status,
          completedAt: nextTask.completedAt,
          durationSeconds: nextTask.durationSeconds,
          exitCode: nextTask.exitCode,
          resultSummary: "",
          rawOutput: nextTask.rawOutput,
          rawError: nextTask.rawError,
        });

        return nextTask;
      }));
      setActionNotice({ tone: "success", text: `Команда "${task.title}" отменена на агенте ${task.agentName}.` });
      void loadTasks();
    } catch (error) {
      setActionNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось прервать выполнение.",
      });
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
          title="Запуск по группе"
          subtitle={`${groupName}. Команды уходят сразу на выбранные машины, а сценарии пока доступны только как библиотека шагов.`}
          action={
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
              <Users size={14} />
              <span>{onlineAgents.length}/{agents.length} online</span>
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
                const supportedAgents = onlineAgents.filter((agent) => getCommandAvailability(item, agent).runnable);
                const supportedAgentsCount = supportedAgents.length;
                const isRunnable = supportedAgentsCount > 0;
                const hasPlaceholders = supportedAgents.some((agent) => extractPlaceholderTokens(getCommandAvailability(item, agent).resolvedCommand).length > 0);
                const statusText = !onlineAgents.length
                  ? "В группе нет online машин"
                  : isRunnable
                    ? supportedAgentsCount === onlineAgents.length
                      ? hasPlaceholders
                        ? "Откроется один ввод параметров для всех online машин"
                        : "Готова к запуску на всех online машинах"
                      : `Доступно для ${supportedAgentsCount} из ${onlineAgents.length} online`
                    : "Недоступно для online машин группы";

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!isRunnable}
                    onClick={() => handleCommandClick(item)}
                    className={`w-[280px] shrink-0 rounded-2xl border p-3 text-left transition sm:w-[300px] ${
                      isRunnable
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
                      {item.bashScript || item.powerShellScript || "Скрипт не задан"}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-white/40">{statusText}</span>
                      <span className={`inline-flex items-center gap-1 text-xs ${isRunnable ? "text-accent" : "text-white/30"}`}>
                        <Play size={12} />
                        {isRunnable ? "Запустить на группе" : onlineAgents.length ? "Недоступно" : "Оффлайн"}
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
                const runnableAgentsCount = onlineAgents.filter((agent) =>
                  (scenario.commands ?? []).some((step) => {
                    const command = commandsById.get(step.commandId);
                    if (!command) return false;
                    const availability = getCommandAvailability(command, agent);
                    return availability.runnable && extractPlaceholderTokens(availability.resolvedCommand).length === 0;
                  }),
                ).length;
                const isRunnable = runnableAgentsCount > 0;

                return (
                  <button
                    key={scenario.id}
                    type="button"
                    disabled={!isRunnable}
                    onClick={() => handleScenarioClick(scenario.id)}
                    className={`w-[280px] shrink-0 rounded-2xl border p-3 text-left transition sm:w-[300px] ${
                      isRunnable
                        ? "border-white/8 bg-black/20 hover:border-amber-400/20 hover:bg-white/[0.04]"
                        : "cursor-not-allowed border-amber-500/20 bg-amber-500/5 opacity-75"
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
                    <div className={`mt-3 inline-flex items-center gap-1 text-xs ${isRunnable ? "text-amber-200" : "text-white/30"}`}>
                      <Play size={12} />
                      {isRunnable ? `Запустить сценарий на ${runnableAgentsCount}` : onlineAgents.length ? "Недоступно" : "Нет online машин"}
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
                        <span>{formatTaskTime(task.createdAt)} · Команда</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
                          {task.agentName}
                        </span>
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
