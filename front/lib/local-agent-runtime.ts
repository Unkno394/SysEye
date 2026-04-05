"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { getAgentStatus, getDistributionKey, type AgentDto, type AgentStatus, type OsType } from "@/lib/backend-types";
import { getOsTypeForPlatform, inferLocalAgentPlatform, type AgentLaunchPlatform } from "@/lib/agent-launch";

const STORAGE_KEY = "syseye-local-agent-launches";
const EVENT_NAME = "syseye-local-agent-launches-changed";
const LOCAL_LAUNCH_TTL_MS = 12 * 60 * 60 * 1000;
const agentOsSyncRequests = new Map<string, Promise<void>>();

export type LocalAgentLaunchInfo = {
  launchedAt: number;
  platform: AgentLaunchPlatform;
};

export type LocalAgentLaunches = Record<string, LocalAgentLaunchInfo>;

function sanitizeLaunches(raw: unknown, now = Date.now()): LocalAgentLaunches {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const next: LocalAgentLaunches = {};

  for (const [agentId, value] of Object.entries(raw)) {
    if (!agentId.trim()) {
      continue;
    }

    let launchInfo: LocalAgentLaunchInfo | null = null;

    if (typeof value === "number" && Number.isFinite(value)) {
      launchInfo = {
        launchedAt: value,
        platform: inferLocalAgentPlatform(),
      };
    } else if (value && typeof value === "object") {
      const launchedAt = "launchedAt" in value ? (value as { launchedAt?: unknown }).launchedAt : null;
      const platform = "platform" in value ? (value as { platform?: unknown }).platform : null;

      if (typeof launchedAt === "number" && Number.isFinite(launchedAt)) {
        launchInfo = {
          launchedAt,
          platform: platform === "windows" ? "windows" : "linux",
        };
      }
    }

    if (!launchInfo) {
      continue;
    }

    if (now - launchInfo.launchedAt > LOCAL_LAUNCH_TTL_MS) {
      continue;
    }

    next[agentId] = launchInfo;
  }

  return next;
}

function readLaunches(): LocalAgentLaunches {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeLaunches(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    return {};
  }
}

function writeLaunches(value: LocalAgentLaunches) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function markAgentLaunched(agentId: string, platform = inferLocalAgentPlatform()) {
  const resolvedId = agentId.trim();
  if (!resolvedId) {
    return;
  }

  writeLaunches({
    ...readLaunches(),
    [resolvedId]: {
      launchedAt: Date.now(),
      platform,
    },
  });
}

export function clearAgentLaunch(agentId: string) {
  const resolvedId = agentId.trim();
  if (!resolvedId) {
    return;
  }

  const next = { ...readLaunches() };
  delete next[resolvedId];
  writeLaunches(next);
}

export function useLocalAgentLaunches() {
  const [launches, setLaunches] = useState<LocalAgentLaunches>({});

  useEffect(() => {
    const sync = () => {
      setLaunches(readLaunches());
    };

    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return launches;
}

export function getEffectiveAgentStatus(
  agent: Pick<AgentDto, "id" | "lastHeartbeatAt">,
  _launches: LocalAgentLaunches,
): AgentStatus {
  void _launches;
  return getAgentStatus(agent.lastHeartbeatAt);
}

export function getEffectiveAgentOs(
  agent: Pick<AgentDto, "id" | "os" | "distribution">,
  launches: LocalAgentLaunches,
): OsType | null {
  if (agent.os === 1 || agent.os === 2) {
    return agent.os;
  }

  const distributionKey = getDistributionKey(agent.distribution, agent.os);
  if (distributionKey === "windows") {
    return 2;
  }

  if (distributionKey !== "unknown" && distributionKey !== "macos") {
    return 1;
  }

  const launchInfo = launches[agent.id];
  if (!launchInfo) {
    return null;
  }

  return getOsTypeForPlatform(launchInfo.platform);
}

export function applyEffectiveAgentMetadata(agent: AgentDto, launches: LocalAgentLaunches): AgentDto {
  const os = getEffectiveAgentOs(agent, launches);

  return {
    ...agent,
    os,
  };
}

export async function ensureServerAgentOs(agent: Pick<AgentDto, "id" | "os">) {
  const resolvedAgentId = String(agent.id ?? "").trim();
  if (!resolvedAgentId) {
    throw new Error("Не удалось определить агента для запуска.");
  }

  if (agent.os !== 1 && agent.os !== 2) {
    throw new Error("Не удалось определить платформу агента. Переподключи агент ещё раз.");
  }

  const requestKey = `${resolvedAgentId}:${agent.os}`;
  const pendingRequest = agentOsSyncRequests.get(requestKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = apiJson<void>(
    `/api/hackaton/agent/${resolvedAgentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        os: agent.os,
      }),
    },
    "Не удалось синхронизировать платформу агента с сервером.",
  ).finally(() => {
    agentOsSyncRequests.delete(requestKey);
  });

  agentOsSyncRequests.set(requestKey, request);
  return request;
}

export function useLocalAgentHeartbeats(agentIds: string[]) {
  void agentIds;
}
