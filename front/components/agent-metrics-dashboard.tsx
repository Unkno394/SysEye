"use client";

import { Activity, AlertTriangle, Clock3, Gauge, Sparkles } from "lucide-react";
import { GlassCard, SectionTitle } from "@/components/ui";
import type { AgentMetricsDto } from "@/lib/backend-types";

type AgentMetricsDashboardProps = {
  metrics: AgentMetricsDto | null;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  agentName?: string | null;
  agentMeta?: string | null;
  emptyMessage?: string;
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 сек";

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} сек`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} мин ${rest} сек`;
}

function formatDay(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatWeekday(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleDateString("ru-RU", {
    weekday: "short",
  });
}

function buildLinePath(points: { x: number; y: number }[]) {
  if (!points.length) return "";

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function KpiCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "accent" | "danger";
}) {
  const valueTone =
    tone === "accent" ? "text-accent" : tone === "danger" ? "text-rose-300" : "text-white";

  return (
    <div className="min-h-[164px] rounded-[1.65rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.08))] p-4 sm:p-5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-black/20 text-white/65">
        {icon}
      </span>
      <div className="mt-5 text-[11px] uppercase tracking-[0.16em] leading-5 text-white/35">{label}</div>
      <div className={`mt-3 text-3xl font-semibold leading-tight sm:text-[2rem] ${valueTone}`}>{value}</div>
    </div>
  );
}

function ActivityChart({ metrics }: { metrics: AgentMetricsDto }) {
  const points = metrics.activity ?? [];
  const maxRuns = Math.max(1, ...points.map((point) => point.totalRuns));
  const maxDuration = Math.max(1, ...points.map((point) => point.averageDurationSeconds || 0));
  const graphBottom = 226;
  const graphHeight = 160;
  const barWidth = 54;
  const gap = 28;

  const durationPoints = points.map((point, index) => {
    const x = 78 + index * (barWidth + gap) + barWidth / 2;
    const y = graphBottom - ((point.averageDurationSeconds || 0) / maxDuration) * 120;
    return { x, y };
  });

  return (
    <div className="rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(72,240,173,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.12))] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Activity size={16} className="text-accent" />
            Активность за 7 дней
          </div>
          <div className="mt-1 text-sm text-white/55">Запуски по дням, ошибки и средняя длительность.</div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-white/45">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            Запуски
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            Ошибки
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full bg-sky-300" />
            Среднее время
          </span>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[1.55rem] border border-white/8 bg-[#081018] p-3 sm:p-4">
        <svg viewBox="0 0 760 286" className="h-[320px] w-full">
          <defs>
            <linearGradient id="runsGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(72,240,173,0.9)" />
              <stop offset="100%" stopColor="rgba(72,240,173,0.18)" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="rgba(101, 224, 255, 0.88)" />
              <stop offset="100%" stopColor="rgba(171, 247, 208, 0.9)" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((step) => {
            const y = 50 + step * 44;
            const label = Math.round((maxRuns * (3 - step)) / 3);
            return (
              <g key={step}>
                <line x1="46" y1={y} x2="716" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 8" />
                <text x="20" y={y + 4} fill="rgba(255,255,255,0.26)" fontSize="11">
                  {label}
                </text>
              </g>
            );
          })}

          <path d={buildLinePath(durationPoints)} fill="none" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" />

          {durationPoints.map((point, index) => (
            <g key={`duration-${points[index]?.date ?? index}`}>
              <circle cx={point.x} cy={point.y} r="5" fill="#65e0ff" />
              <circle cx={point.x} cy={point.y} r="9" fill="rgba(101,224,255,0.16)" />
            </g>
          ))}

          {points.map((point, index) => {
            const x = 52 + index * (barWidth + gap);
            const totalHeight = point.totalRuns > 0 ? (point.totalRuns / maxRuns) * graphHeight : 8;
            const errorHeight = point.totalRuns > 0 ? (point.errorRuns / maxRuns) * graphHeight : 0;
            const y = graphBottom - totalHeight;
            const errorY = graphBottom - errorHeight;

            return (
              <g key={point.date}>
                <rect x={x} y="66" width={barWidth} height="160" rx="22" fill="rgba(255,255,255,0.035)" />
                <rect x={x} y={y} width={barWidth} height={Math.max(totalHeight, 8)} rx="20" fill="url(#runsGradient)" />
                {point.errorRuns > 0 ? (
                  <rect x={x} y={errorY} width={barWidth} height={Math.max(errorHeight, 8)} rx="20" fill="rgba(251,113,133,0.92)" />
                ) : null}
                <text x={x + barWidth / 2} y={Math.max(y - 10, 18)} textAnchor="middle" fill="rgba(255,255,255,0.86)" fontSize="14" fontWeight="600">
                  {point.totalRuns}
                </text>
                <text x={x + barWidth / 2} y="252" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="12">
                  {formatWeekday(point.date)}
                </text>
                <text x={x + barWidth / 2} y="268" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="11">
                  {formatDay(point.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function AgentMetricsDashboard({
  metrics,
  loading = false,
  title = "Метрики агента",
  subtitle = "Запуски, средняя длительность, ошибки за сегодня и динамика по дням.",
  agentName,
  agentMeta,
  emptyMessage = "Метрики пока недоступны.",
}: AgentMetricsDashboardProps) {
  if (loading) {
    return <GlassCard className="p-6 text-white/55 sm:p-7">Загрузка метрик...</GlassCard>;
  }

  if (!metrics) {
    return (
      <GlassCard className="p-6 sm:p-7">
        <SectionTitle title={title} subtitle={subtitle} />
        <div className="rounded-[1.75rem] border border-dashed border-white/10 px-5 py-10 text-center text-white/40">
          {emptyMessage}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 sm:p-7">
      <SectionTitle title={title} subtitle={subtitle} />

      {agentName ? (
        <div className="mb-4 rounded-[1.65rem] border border-accent/15 bg-[radial-gradient(circle_at_top_left,rgba(72,240,173,0.16),transparent_50%),linear-gradient(180deg,rgba(72,240,173,0.08),rgba(0,0,0,0.08))] px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Выбранная машина</div>
          <div className="mt-2 text-lg font-semibold text-white">{agentName}</div>
          {agentMeta ? <div className="mt-1 text-sm text-white/50">{agentMeta}</div> : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,340px)]">
        <div className="rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(72,240,173,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.08))] p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Sparkles size={16} className="text-accent" />
              Техническая сводка
            </div>
            <div className="mt-1 text-sm text-white/55">Главные цифры по выбранной машине без лишней детализации.</div>
          </div>

          <div className="mt-5 grid gap-3 grid-cols-2">
            <KpiCard icon={<Gauge size={16} />} label="Всего запусков" value={String(metrics.totalRuns)} />
            <KpiCard icon={<Clock3 size={16} />} label="Среднее время" value={formatDuration(metrics.averageDurationSeconds)} />
            <KpiCard icon={<AlertTriangle size={16} />} label="Ошибок за день" value={String(metrics.errorsToday)} tone={metrics.errorsToday ? "danger" : "default"} />
            <KpiCard icon={<Activity size={16} />} label="Успешность" value={`${metrics.successRate.toFixed(1)}%`} tone="accent" />
          </div>
        </div>

        <div className="rounded-[1.85rem] border border-white/8 bg-black/20 p-4 sm:p-5">
          <div className="text-sm font-medium text-white">Детали по текущему состоянию</div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">Сегодня</div>
              <div className="mt-2 text-3xl font-semibold text-white">{metrics.runsToday}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Успешно</div>
                <div className="mt-2 text-2xl font-semibold text-accent">{metrics.successfulRuns}</div>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Ошибки</div>
                <div className="mt-2 text-2xl font-semibold text-rose-300">{metrics.failedRuns}</div>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">В работе</div>
                <div className="mt-2 text-2xl font-semibold text-sky-300">{metrics.runningRuns}</div>
              </div>
              <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">В очереди</div>
                <div className="mt-2 text-2xl font-semibold text-violet-300">{metrics.queuedRuns}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ActivityChart metrics={metrics} />
      </div>
    </GlassCard>
  );
}
