import type { CommandDto, TaskExecutionDto, TaskStatus } from "@/lib/backend-types";

export type DiagnosticComparisonItem = {
  command: CommandDto;
  latestSuccessfulRun?: TaskExecutionDto;
  previousSuccessfulRun?: TaskExecutionDto;
  latestAttemptStatus?: TaskStatus;
  latestAttemptAt?: string;
  comparisonState: "no-data" | "no-baseline" | "unchanged" | "changed";
  addedLines: string[];
  removedLines: string[];
};

const IGNORED_COMPARISON_STATUSES = new Set<TaskStatus>(["cancelled", "interrupted"]);
const SUCCESS_STATUS: TaskStatus = "success";

export function isSystemDiagnosticCommand(command: CommandDto) {
  return command.isSystem && (command.name.startsWith("Базовая проверка:") || command.name.startsWith("Диагностика:"));
}

export function isComparableDiagnosticCommand(command: CommandDto) {
  return command.isSystem && command.name.startsWith("Базовая проверка:");
}

function normalizeOutputLines(raw?: string) {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "ru"));
}

export function buildDiagnosticComparisons(
  executions: TaskExecutionDto[],
  commandsById: Map<string, CommandDto>,
) {
  const comparableCommands = Array.from(commandsById.values()).filter(isComparableDiagnosticCommand);

  return comparableCommands.map<DiagnosticComparisonItem>((command) => {
    const history = executions
      .filter((execution) => execution.commandId === command.id)
      .slice()
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());

    const latestAttempt = history[0];
    const successfulRuns = history.filter((execution) => execution.status === SUCCESS_STATUS);
    const latestSuccessfulRun = successfulRuns[0];
    const previousSuccessfulRun = successfulRuns[1];

    if (!latestSuccessfulRun) {
      return {
        command,
        latestAttemptStatus: latestAttempt?.status,
        latestAttemptAt: latestAttempt?.startedAt,
        comparisonState: "no-data",
        addedLines: [],
        removedLines: [],
      };
    }

    if (!previousSuccessfulRun) {
      return {
        command,
        latestSuccessfulRun,
        latestAttemptStatus: latestAttempt?.status,
        latestAttemptAt: latestAttempt?.startedAt,
        comparisonState: "no-baseline",
        addedLines: [],
        removedLines: [],
      };
    }

    const currentLines = normalizeOutputLines(latestSuccessfulRun.rawOutput);
    const previousLines = normalizeOutputLines(previousSuccessfulRun.rawOutput);
    const previousSet = new Set(previousLines);
    const currentSet = new Set(currentLines);

    const addedLines = currentLines.filter((line) => !previousSet.has(line));
    const removedLines = previousLines.filter((line) => !currentSet.has(line));

    return {
      command,
      latestSuccessfulRun,
      previousSuccessfulRun,
      latestAttemptStatus: latestAttempt?.status,
      latestAttemptAt: latestAttempt?.startedAt,
      comparisonState: addedLines.length || removedLines.length ? "changed" : "unchanged",
      addedLines: addedLines.slice(0, 4),
      removedLines: removedLines.slice(0, 4),
    };
  });
}

export function isIgnoredComparisonStatus(status?: TaskStatus) {
  return status ? IGNORED_COMPARISON_STATUSES.has(status) : false;
}
