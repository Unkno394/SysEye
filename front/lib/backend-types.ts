export type Role = 0 | 1 | 2;
export type OsType = 0 | 1 | 2;
export type AgentStatus = "online" | "offline";
export type TaskStatus = "queued" | "running" | "success" | "error" | "cancelled" | "interrupted" | "sent";

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  skip: number;
  take: number;
};

export type UserInfo = {
  id: string;
  role: Role;
  name: string;
  login?: string;
  email?: string;
  isEmailConfirmed: boolean;
};

export type AgentDto = {
  id: string;
  name: string;
  ipAddress?: string | null;
  port?: number | null;
  os?: OsType | null;
  distribution?: string | null;
  lastHeartbeatAt: string;
};

export type CommandDto = {
  id: string;
  name: string;
  description: string;
  bashScript: string;
  powerShellScript: string;
  isSystem: boolean;
  logRegex?: string | null;
};

export type CommandPlaceholderDto = {
  index: number;
  name: string;
};

export type ApiKeyDto = {
  id: string;
  value: string;
};

export type ApiKeyInfoDto = {
  id: string;
  revokedAt: string;
};

export type AgentConnectionTokenDto = {
  agentId: string;
  name: string;
  token: string;
};

export type AgentTaskDto = {
  id: string;
  title: string;
  status: TaskStatus;
  output: string;
  error: string;
  exitCode?: number | null;
  createdAt: string;
};

export type TaskExecutionDto = {
  id: string;
  commandId: string;
  agentId: string;
  title?: string;
  startedAt: string;
  status: TaskStatus;
  completedAt?: string | null;
  durationSeconds?: number | null;
  exitCode?: number | null;
  resultSummary: string;
  rawOutput?: string;
  rawError?: string;
};

export type ExecutionLogDto = {
  executionId?: string | null;
  message: string;
  level?: string | null;
  timestamp: string;
  durationSeckonds?: number;
  commandId?: string | null;
  category?: string | null;
};

export type AnalyticsDto = {
  executions: number;
  errors: number;
  successRate: number;
  averageDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
};

export type AgentAnalyticsDto = {
  agentId: string;
  agentName?: string | null;
  total?: AnalyticsDto | null;
  today?: AnalyticsDto | null;
};

export type CommandAnalyticsDto = {
  commandId: string;
  commandName?: string | null;
  total?: AnalyticsDto | null;
  today?: AnalyticsDto | null;
};

export type AgentMetricsPointDto = {
  date: string;
  totalRuns: number;
  successRuns: number;
  errorRuns: number;
  averageDurationSeconds: number;
};

export type AgentMetricsDto = {
  agentId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  runningRuns: number;
  queuedRuns: number;
  runsToday: number;
  errorsToday: number;
  averageDurationSeconds: number;
  successRate: number;
  activity: AgentMetricsPointDto[];
};

export type AgentRatingDto = {
  rank: number;
  agentId: string;
  agentName: string;
  ipAddress?: string | null;
  os?: OsType | null;
  distribution?: string | null;
  lastHeartbeatAt: string;
  totalRuns: number;
  errorsToday: number;
  averageDurationSeconds: number;
  successRate: number;
  stabilityScore: number;
  speedScore: number;
  overallScore: number;
};

export type ScenarioDto = {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
};

export type ScenarioCommandDto = {
  commandId: string;
  commandName: string;
  order: number;
};

export type ScenarioDetailsDto = {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  commands: ScenarioCommandDto[];
};

function normalizeValue(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function getOsLabel(os?: OsType | null) {
  if (os === 2) return "Windows";
  if (os === 1) return "Linux";
  return "Не указана";
}

export function getDistributionKey(distribution?: string | null, os?: OsType | null) {
  const value = normalizeValue(distribution);
  if (!value) {
    if (os === 2) return "windows";
    if (os === 1) return "linux";
    return "unknown";
  }

  if (value.includes("arch")) return "arch";
  if (value.includes("ubuntu")) return "ubuntu";
  if (value.includes("debian")) return "debian";
  if (value.includes("fedora")) return "fedora";
  if (value.includes("manjaro")) return "manjaro";
  if (value.includes("kali")) return "kali";
  if (value.includes("alpine")) return "alpine";
  if (value.includes("opensuse") || value.includes("open suse") || value.includes("suse")) return "opensuse";
  if (value.includes("pop")) return "pop";
  if (value.includes("windows")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("linux")) return "linux";
  return value;
}

export function getDistributionLabel(distribution?: string | null, os?: OsType | null) {
  const key = getDistributionKey(distribution, os);

  switch (key) {
    case "arch":
      return "Arch Linux";
    case "ubuntu":
      return "Ubuntu";
    case "debian":
      return "Debian";
    case "fedora":
      return "Fedora";
    case "manjaro":
      return "Manjaro";
    case "kali":
      return "Kali Linux";
    case "alpine":
      return "Alpine Linux";
    case "opensuse":
      return "openSUSE";
    case "pop":
      return "Pop!_OS";
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return distribution?.trim() || getOsLabel(os);
  }
}

export function getRoleLabel(role: Role) {
  switch (role) {
    case 2:
      return "Администратор";
    case 1:
      return "Модератор";
    default:
      return "Пользователь";
  }
}

export function getAgentStatus(lastHeartbeatAt?: string | null): AgentStatus {
  if (!lastHeartbeatAt) return "offline";

  const timestamp = new Date(lastHeartbeatAt);
  if (Number.isNaN(timestamp.getTime())) return "offline";

  return Date.now() - timestamp.getTime() <= 45_000 ? "online" : "offline";
}

export function getRelativeHeartbeatLabel(lastHeartbeatAt?: string | null) {
  if (!lastHeartbeatAt) return "нет данных";

  const timestamp = new Date(lastHeartbeatAt);
  if (Number.isNaN(timestamp.getTime())) return "нет данных";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp.getTime()) / 1000));

  if (diffSeconds < 5) return "только что";
  if (diffSeconds < 60) return `${diffSeconds} сек назад`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дн назад`;
}
