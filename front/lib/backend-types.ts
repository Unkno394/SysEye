export type Role = 0 | 1 | 2;
export type OsType = 0 | 1 | 2;

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
  take: number;
  skip: number;
};

export type UserInfo = {
  role: Role;
  name: string;
  login: string;
  email: string;
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
};

export type CommandPlaceholderDto = {
  index: number;
  name: string;
};

export type ApiKeyDto = {
  id: string;
  name: string;
  value: string;
};

export type AgentConnectionTokenDto = {
  token: string;
};

export type AgentTaskDto = {
  id: string;
  title: string;
  status: "queued" | "running" | "success" | "error";
  output: string;
  error: string;
  exitCode?: number | null;
  createdAt: string;
};

export type AgentStatus = "online" | "offline" | "busy";

export function getOsLabel(os?: OsType | null) {
  if (os === 1) return "Linux";
  if (os === 2) return "Windows";
  return "Не указана";
}

export function getDistributionKey(distribution?: string | null, os?: OsType | null) {
  const value = (distribution || "").trim().toLowerCase();

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
  if (value.includes("opensuse") || value.includes("suse")) return "opensuse";
  if (value.includes("pop")) return "pop";
  if (value.includes("windows")) return "windows";
  if (value.includes("darwin") || value.includes("mac")) return "macos";
  if (value.includes("linux")) return "linux";

  return value;
}

export function getDistributionLabel(distribution?: string | null, os?: OsType | null) {
  switch (getDistributionKey(distribution, os)) {
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

export function getRoleLabel(role?: Role) {
  if (role === 2) return "Администратор";
  if (role === 1) return "Модератор";
  return "Пользователь";
}

export function getAgentStatus(lastHeartbeatAt?: string): AgentStatus {
  if (!lastHeartbeatAt) return "offline";

  const heartbeatMs = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(heartbeatMs)) return "offline";

  const diffMinutes = (Date.now() - heartbeatMs) / 60000;
  return diffMinutes <= 5 ? "online" : "offline";
}

export function getRelativeHeartbeatLabel(lastHeartbeatAt?: string) {
  if (!lastHeartbeatAt) return "неизвестно";

  const heartbeatMs = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(heartbeatMs)) return "неизвестно";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - heartbeatMs) / 1000));

  if (diffSeconds < 10) return "только что";
  if (diffSeconds < 60) return `${diffSeconds} сек назад`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дн назад`;
}
