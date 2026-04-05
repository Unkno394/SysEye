import type { CommandDto, TaskExecutionDto, TaskStatus } from "@/lib/backend-types";

export type DiagnosticComparisonItem = {
  command: CommandDto;
  latestSuccessfulRun?: TaskExecutionDto;
  previousSuccessfulRun?: TaskExecutionDto;
  latestAttemptStatus?: TaskStatus;
  latestAttemptAt?: string;
  comparisonState: "no-data" | "no-baseline" | "unchanged" | "changed" | "ignored";
  addedLines: string[];
  removedLines: string[];
};

const IGNORED_COMPARISON_STATUSES = new Set<TaskStatus>(["cancelled", "interrupted"]);
const SUCCESS_STATUS: TaskStatus = "success";
const COMPARABLE_DIAGNOSTIC_COMMAND_NAMES = new Set([
  "Hostname",
  "Machine name from system info",
  "OS version",
  "Kernel / build version",
  "IPv4 addresses",
  "IPv6 addresses",
  "DNS servers",
  "IPv4 routes",
  "IPv6 routes",
  "Listening TCP ports",
  "All TCP connections",
  "Active network adapters",
]);

export const DIAGNOSTIC_SUMMARY_TITLE = "Базовые проверки";

export const DIAGNOSTIC_SUMMARY_TEXT =
  "Сравниваем hostname, IP-адреса, интерфейсы, версию ОС, порты и базовую сетевую информацию.";

export const DIAGNOSTIC_INTERRUPTED_NOTE =
  "Прерванные циклические команды вроде ping 8.8.8.8 пропускаются и в сравнение не попадают.";

export function isSystemDiagnosticCommand(command: CommandDto) {
  return command.isSystem && COMPARABLE_DIAGNOSTIC_COMMAND_NAMES.has(command.name);
}

export function isComparableDiagnosticCommand(command: CommandDto) {
  return command.isSystem && COMPARABLE_DIAGNOSTIC_COMMAND_NAMES.has(command.name);
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
  const commandOrder = new Map(
    Array.from(COMPARABLE_DIAGNOSTIC_COMMAND_NAMES.values()).map((name, index) => [name, index]),
  );
  const stateOrder: Record<DiagnosticComparisonItem["comparisonState"], number> = {
    changed: 0,
    unchanged: 1,
    "no-baseline": 2,
    "no-data": 3,
    ignored: 4,
  };

  return comparableCommands
    .map<DiagnosticComparisonItem>((command) => {
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
          comparisonState: latestAttempt && isIgnoredComparisonStatus(latestAttempt.status) ? "ignored" : "no-data",
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
    })
    .sort((left, right) => {
      const stateDiff = stateOrder[left.comparisonState] - stateOrder[right.comparisonState];
      if (stateDiff !== 0) {
        return stateDiff;
      }

      const leftOrder = commandOrder.get(left.command.name) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = commandOrder.get(right.command.name) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.command.name.localeCompare(right.command.name, "ru");
    });
}

export function isIgnoredComparisonStatus(status?: TaskStatus) {
  return status ? IGNORED_COMPARISON_STATUSES.has(status) : false;
}
