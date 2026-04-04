export type AgentGroup = {
  id: string;
  name: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
};

const AGENT_GROUPS_STORAGE_KEY = "syseye.agent-groups.v1";
const AGENT_GROUPS_EVENT = "syseye:agent-groups";

function normalizeGroups(value: unknown): AgentGroup[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const candidate = item as Partial<AgentGroup>;
      const id = String(candidate.id ?? "").trim();
      const name = String(candidate.name ?? "").trim();
      const createdAt = String(candidate.createdAt ?? "").trim();
      const updatedAt = String(candidate.updatedAt ?? "").trim();
      const agentIds = Array.isArray(candidate.agentIds)
        ? Array.from(new Set(candidate.agentIds.map((agentId) => String(agentId ?? "").trim()).filter(Boolean)))
        : [];

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        agentIds,
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
      } satisfies AgentGroup;
    })
    .filter((item): item is AgentGroup => Boolean(item));
}

function readGroups() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(AGENT_GROUPS_STORAGE_KEY);
    if (!raw) return [];

    return normalizeGroups(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeGroups(groups: AgentGroup[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(AGENT_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  window.dispatchEvent(new CustomEvent(AGENT_GROUPS_EVENT));
}

function createGroupId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getAgentGroups() {
  return readGroups();
}

export function getAgentGroup(id: string) {
  return readGroups().find((group) => group.id === id) ?? null;
}

export function upsertAgentGroup(input: { id?: string; name: string; agentIds: string[] }) {
  const now = new Date().toISOString();
  const normalizedName = input.name.trim();
  const normalizedAgentIds = Array.from(new Set(input.agentIds.map((agentId) => agentId.trim()).filter(Boolean)));
  const current = readGroups();
  const existing = input.id ? current.find((group) => group.id === input.id) : null;

  const nextGroup: AgentGroup = {
    id: existing?.id ?? createGroupId(),
    name: normalizedName,
    agentIds: normalizedAgentIds,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = existing
    ? current.map((group) => (group.id === existing.id ? nextGroup : group))
    : [nextGroup, ...current];

  writeGroups(next);
  return nextGroup;
}

export function removeAgentGroup(id: string) {
  writeGroups(readGroups().filter((group) => group.id !== id));
}

export function subscribeToAgentGroups(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== AGENT_GROUPS_STORAGE_KEY) {
      return;
    }

    listener();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(AGENT_GROUPS_EVENT, listener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(AGENT_GROUPS_EVENT, listener);
  };
}
