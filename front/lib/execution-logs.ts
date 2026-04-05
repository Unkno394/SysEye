import type { ExecutionLogDto } from "@/lib/backend-types";

function getLogTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function mergeExecutionLogs(current: ExecutionLogDto[], incoming: ExecutionLogDto[]) {
  return [...current, ...incoming].sort((left, right) => getLogTime(left.timestamp) - getLogTime(right.timestamp));
}

export function joinExecutionLogMessages(logs: ExecutionLogDto[]) {
  return logs
    .map((entry) => entry.message)
    .filter(Boolean)
    .join("\n");
}

export function matchesExecutionLogRegex(message: string, pattern?: string | null) {
  if (!pattern?.trim()) {
    return false;
  }

  try {
    return new RegExp(pattern, "i").test(message);
  } catch {
    return false;
  }
}
