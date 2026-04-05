"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Layers3, Users } from "lucide-react";
import { AgentGroupTerminalPanel } from "@/components/agent-group-terminal-panel";
import { GlassCard, StatusBadge } from "@/components/ui";
import { apiJson } from "@/lib/api-client";
import { loadAllCommands } from "@/lib/commands";
import { getAgentGroup, subscribeToAgentGroups, type AgentGroup } from "@/lib/agent-groups";
import type { AgentDto, CommandDto, PagedResult } from "@/lib/backend-types";
import { getAgentStatus, getDistributionLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { useClientRealtime } from "@/lib/client-realtime";
import { applyEffectiveAgentMetadata, getEffectiveAgentStatus, useLocalAgentLaunches } from "@/lib/local-agent-runtime";

export default function AgentGroupDetailsPage() {
  const params = useParams<{ id: string }>();
  const groupId = params?.id ?? "";

  const [group, setGroup] = useState<AgentGroup | null>(null);
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [commands, setCommands] = useState<CommandDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const localLaunches = useLocalAgentLaunches();

  const loadGroup = () => {
    setGroup(getAgentGroup(groupId));
  };

  const loadData = async (background = false) => {
    if (!background) {
      setLoading(true);
    }

    setError(null);
    loadGroup();

    try {
      const [agentsData, _commandsPage, commands] = await Promise.all([
        apiJson<PagedResult<AgentDto>>("/api/hackaton/agent?take=100&skip=0", { method: "GET" }, "Не удалось загрузить агентов."),
        apiJson<PagedResult<CommandDto>>("/api/hackaton/command?take=100&skip=0", { method: "GET" }, "Не удалось загрузить команды."),
        loadAllCommands("Не удалось загрузить команды."),
      ]);

      setAgents(agentsData.items ?? []);

      setCommands(commands);

      /* if (commandsData.totalCount > commandItems.length) {
        const fullCommandsData = await apiJson<PagedResult<CommandDto>>(
          `/api/hackaton/command?take=${Math.max(COMMANDS_FETCH_LIMIT, commandsData.totalCount)}&skip=0`,
          { method: "GET" },
          "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєРѕРјР°РЅРґС‹.",
        );
        setCommands(fullCommandsData.items ?? commandItems);
      } */
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные группы.");
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!groupId) return undefined;

    void loadData();
    const stopGroupsSubscription = subscribeToAgentGroups(() => {
      loadGroup();
    });
    const intervalId = window.setInterval(() => {
      void loadData(true);
    }, 10_000);

    return () => {
      stopGroupsSubscription();
      window.clearInterval(intervalId);
    };
  }, [groupId]);

  useClientRealtime(
    {
      onAgentUpdated: (updatedAgent) => {
        setAgents((current) => {
          const existingIndex = current.findIndex((agent) => agent.id === updatedAgent.id);
          if (existingIndex === -1) {
            return [updatedAgent, ...current].sort(
              (left, right) => new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime(),
            );
          }

          const nextAgents = [...current];
          nextAgents[existingIndex] = updatedAgent;
          nextAgents.sort((left, right) => new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime());
          return nextAgents;
        });
      },
      onAgentDeleted: ({ agentId }) => {
        setAgents((current) => current.filter((agent) => agent.id !== agentId));
      },
    },
    Boolean(groupId),
  );

  const selectedAgents = useMemo(() => {
    if (!group) return [];

    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    return group.agentIds
      .map((agentId) => agentMap.get(agentId))
      .map((agent) => (agent ? applyEffectiveAgentMetadata(agent, localLaunches) : null))
      .filter((agent): agent is AgentDto => Boolean(agent));
  }, [agents, group, localLaunches]);

  const onlineCount = useMemo(
    () => selectedAgents.filter((agent) => getEffectiveAgentStatus(agent, localLaunches) === "online").length,
    [localLaunches, selectedAgents],
  );

  const latestHeartbeat = useMemo(() => {
    const timestamps = selectedAgents
      .map((agent) => new Date(agent.lastHeartbeatAt).getTime())
      .filter((value) => !Number.isNaN(value));

    if (!timestamps.length) {
      return "нет данных";
    }

    return getRelativeHeartbeatLabel(new Date(Math.max(...timestamps)).toISOString());
  }, [selectedAgents]);

  if (loading) {
    return <GlassCard className="p-8 text-center text-white/55">Загрузка группы...</GlassCard>;
  }

  if (!group) {
    return (
      <GlassCard className="p-8 text-center text-white/55">
        Группа не найдена.
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <GlassCard className="p-6 sm:p-8">
        <div className="space-y-6">
          <div className="min-w-0">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-accent">
              <ChevronLeft size={16} />
              Back to dashboard
            </Link>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="break-words text-3xl font-semibold text-white">{group.name}</h1>
              <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/55">
                Group
              </div>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Здесь можно запускать команды и сценарии сразу на нескольких машинах. Состав группы хранится на этой панели и открывается как отдельная рабочая страница.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedAgents.map((agent) => (
                <span
                  key={agent.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65"
                >
                  <StatusBadge status={getEffectiveAgentStatus(agent, localLaunches)} />
                  <span>{agent.name}</span>
                </span>
              ))}
              {!selectedAgents.length ? (
                <span className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/45">
                  В группе пока нет доступных машин
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Машин в группе</div>
          <div className="mt-3 text-2xl font-semibold text-white">{selectedAgents.length}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Online</div>
          <div className="mt-3 text-2xl font-semibold text-white">{onlineCount}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Offline</div>
          <div className="mt-3 text-2xl font-semibold text-white">{Math.max(0, selectedAgents.length - onlineCount)}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Last heartbeat</div>
          <div className="mt-3 text-2xl font-semibold text-white">{latestHeartbeat}</div>
        </GlassCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <AgentGroupTerminalPanel groupName={group.name} agents={selectedAgents} commands={commands} />

        <GlassCard className="p-5">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/45">
            <Layers3 size={16} />
            Состав группы
          </div>

          <div className="mt-5 space-y-3">
            {selectedAgents.map((agent) => (
              <div key={agent.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-white">{agent.name}</div>
                    <div className="mt-1 text-sm text-white/50">
                      {[getDistributionLabel(agent.distribution, agent.os), agent.ipAddress || null].filter(Boolean).join(" · ") || "Параметры машины появятся после подключения."}
                    </div>
                  </div>
                  <StatusBadge status={getEffectiveAgentStatus(agent, localLaunches)} />
                </div>
              </div>
            ))}

            {!selectedAgents.length ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                Все машины из группы либо удалены, либо пока не загрузились.
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/55">
            <div className="flex items-center gap-2 text-white/70">
              <Users size={16} />
              Команды и сценарии запускаются параллельно на все выбранные машины.
            </div>
          </div>
        </GlassCard>
      </div>

      {error ? (
        <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100/90">{error}</GlassCard>
      ) : null}
    </div>
  );
}
