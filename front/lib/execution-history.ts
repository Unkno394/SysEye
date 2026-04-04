import type { CommandDto, TaskExecutionDto, TaskStatus } from "@/lib/backend-types";

export type ExecutionHistoryItem = {
  id: string;
  agentId: string;
  agentName?: string;
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
  kind: "command";
};

export function extractPlaceholderTokens(script: string) {
  const matches = script.match(/\$\d+|\{\d+\}/g) ?? [];
  return Array.from(new Set(matches)).sort((left, right) => getPlaceholderIndex(left) - getPlaceholderIndex(right));
}

export function getPlaceholderIndex(token: string) {
  const value = token.match(/\d+/)?.[0];
  return Number(value ?? 0);
}

function normalizeExecutionStatus(status?: string | null): TaskStatus {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "success":
      return "success";
    case "error":
      return "error";
    case "cancelled":
      return "cancelled";
    case "interrupted":
      return "interrupted";
    default:
      return "sent";
  }
}

function buildExecutionSummary(execution: TaskExecutionDto) {
  const summary = String(execution.resultSummary ?? "").trim();
  if (summary) {
    return summary;
  }

  switch (normalizeExecutionStatus(execution.status)) {
    case "success":
      return "Проверка завершилась успешно.";
    case "error":
      return "Проверка завершилась с ошибкой.";
    case "cancelled":
      return "Выполнение отменено.";
    case "interrupted":
      return "Выполнение было прервано.";
    case "running":
      return "Команда ещё выполняется.";
    case "queued":
      return "Команда ожидает выполнения.";
    default:
      return "Команда отправлена агенту.";
  }
}

export function mapExecutionToHistoryItem(
  execution: TaskExecutionDto,
  commandsById: Map<string, CommandDto>,
  agentName?: string,
): ExecutionHistoryItem {
  return {
    id: execution.id,
    agentId: execution.agentId,
    agentName,
    commandId: execution.commandId,
    title:
      String(execution.title ?? "").trim() ||
      commandsById.get(execution.commandId)?.name ||
      `Команда ${execution.commandId.slice(0, 8)}`,
    status: normalizeExecutionStatus(execution.status),
    createdAt: execution.startedAt,
    completedAt: execution.completedAt,
    durationSeconds: execution.durationSeconds,
    exitCode: execution.exitCode,
    summary: buildExecutionSummary(execution),
    rawOutput: execution.rawOutput,
    rawError: execution.rawError,
    kind: "command",
  };
}
