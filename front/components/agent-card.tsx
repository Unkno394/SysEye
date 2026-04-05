import Link from "next/link";
import { Activity, Cpu, PlugZap, Trash2 } from "lucide-react";
import type { AgentDto, AgentStatus } from "@/lib/backend-types";
import { getAgentStatus, getDistributionLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { GlassCard, StatusBadge } from "@/components/ui";

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/20 px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2 text-white/55">{icon}{label}</span>
      <span className="break-words text-white sm:text-right">{value}</span>
    </div>
  );
}

export function AgentCard({
  agent,
  status: providedStatus,
  onDelete,
  deleteLoading = false,
}: {
  agent: AgentDto;
  status?: AgentStatus;
  onDelete?: (agent: AgentDto) => void;
  deleteLoading?: boolean;
}) {
  const status = providedStatus ?? getAgentStatus(agent.lastHeartbeatAt);
  const platformLabel = getDistributionLabel(agent.distribution, agent.os);
  const machineDetails = [platformLabel, agent.ipAddress || null].filter(Boolean).join(" · ");

  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="truncate text-lg font-semibold text-white">{agent.name}</h3>
            <StatusBadge status={status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/55">
            <span>{status === "online" ? "Подключён" : "Не подключён"}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-white/45">
              {platformLabel}
            </span>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link href={`/dashboard/agents/${agent.id}`} className="inline-flex flex-1 items-center justify-center rounded-xl border border-accent/20 px-3 py-2 text-sm text-accent transition hover:bg-accent/10 sm:flex-none">
            Open
          </Link>
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(agent)}
              disabled={deleteLoading}
              aria-label={`Удалить агента ${agent.name}`}
              className="inline-flex items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteLoading ? "..." : <Trash2 size={15} />}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <MetaRow icon={<Activity size={14} />} label="Last heartbeat" value={getRelativeHeartbeatLabel(agent.lastHeartbeatAt)} />
        <MetaRow icon={<PlugZap size={14} />} label="Подключение" value={status === "online" ? "Активно" : "Не активно"} />
        <MetaRow icon={<Cpu size={14} />} label="Параметры машины" value={machineDetails || "Пока нет данных"} />
      </div>
    </GlassCard>
  );
}
