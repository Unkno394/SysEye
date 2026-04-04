"use client";

import { Crown, Medal, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui";
import type { AgentRatingDto } from "@/lib/backend-types";
import { getDistributionLabel } from "@/lib/backend-types";

type AgentRatingBoardProps = {
  ratings: AgentRatingDto[];
  loading?: boolean;
  highlightedAgentId?: string | null;
};

function getRankStyles(rank: number) {
  if (rank === 1) {
    return {
      badge: "border-amber-300/35 bg-amber-300/12 text-amber-200",
      card: "border-amber-300/15 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.08))]",
      icon: <Crown size={16} />,
      title: "1 место",
    };
  }

  if (rank === 2) {
    return {
      badge: "border-slate-300/30 bg-slate-300/10 text-slate-200",
      card: "border-slate-300/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.08))]",
      icon: <Medal size={16} />,
      title: "2 место",
    };
  }

  return {
    badge: "border-orange-300/30 bg-orange-300/10 text-orange-200",
    card: "border-orange-300/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.08))]",
    icon: <Medal size={16} />,
    title: "3 место",
  };
}

export function AgentRatingBoard({ ratings, loading = false, highlightedAgentId }: AgentRatingBoardProps) {
  if (loading) {
    return <GlassCard className="p-6 text-white/55">Загрузка рейтинга...</GlassCard>;
  }

  const topThree = ratings.slice(0, 3);

  return (
    <GlassCard className="p-6 sm:p-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-white">Рейтинг агентов</h3>
          <p className="mt-1 text-sm text-white/60">Три лучших машины по текущему проценту успешных запусков.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/45">
          top 3
        </div>
      </div>

      {!topThree.length ? (
        <div className="mt-5 rounded-[1.75rem] border border-dashed border-white/10 px-5 py-10 text-center text-white/40">
          Рейтинг пока недоступен.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {topThree.map((item) => {
            const rankUi = getRankStyles(item.rank);
            const highlighted = highlightedAgentId === item.agentId;
            const platform = getDistributionLabel(item.distribution, item.os);

            return (
              <div
                key={item.agentId}
                className={`rounded-[1.75rem] border p-5 transition ${rankUi.card} ${
                  highlighted ? "ring-1 ring-accent/35" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${rankUi.badge}`}>
                    {rankUi.icon}
                    {rankUi.title}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Success rate</div>
                    <div className="mt-1 text-3xl font-semibold text-accent">{item.successRate.toFixed(1)}%</div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-lg font-semibold text-white">{item.agentName}</div>
                  <div className="mt-1 text-sm text-white/50">
                    {[platform, item.ipAddress || null].filter(Boolean).join(" · ")}
                  </div>
                </div>

                <div className="mt-5 rounded-[1.35rem] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/35">
                    <ShieldCheck size={14} />
                    Доля успешных запусков
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/8 bg-white/[0.04]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(6, Math.min(100, item.successRate))}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
