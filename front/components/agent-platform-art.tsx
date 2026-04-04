import type { AgentDto } from "@/lib/backend-types";
import { getAgentStatus, getOsLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";
import { cn } from "@/lib/utils";

type AgentPlatformArtProps = {
  agent: AgentDto;
  className?: string;
};

type PlatformTheme = {
  badgeLabel: string;
  badgeClassName: string;
  panelClassName: string;
  artClassName: string;
  accentClassName: string;
  art: string;
};

const PLATFORM_THEMES: Record<string, PlatformTheme> = {
  windows: {
    badgeLabel: "Windows",
    badgeClassName: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    panelClassName: "border-sky-400/15 bg-sky-400/[0.07]",
    artClassName: "text-[#87d7ff]",
    accentClassName: "text-sky-200",
    art: String.raw`
   ################  ################
   ################  ################
   ################  ################
   ################  ################

   ################  ################
   ################  ################
   ################  ################
   ################  ################
`.trim(),
  },
  macos: {
    badgeLabel: "macOS",
    badgeClassName: "border-zinc-300/20 bg-zinc-300/10 text-zinc-100",
    panelClassName: "border-zinc-300/15 bg-zinc-300/[0.07]",
    artClassName: "text-[#f2f2f2]",
    accentClassName: "text-zinc-100",
    art: String.raw`
         .:'
      _ :'_
   .- _ -'_  -.
  :__________.-'
  :_______:
   :_______.-;
    ._._._.
`.trim(),
  },
  linux: {
    badgeLabel: "Linux",
    badgeClassName: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    panelClassName: "border-emerald-400/15 bg-emerald-400/[0.07]",
    artClassName: "text-[#8dffcf]",
    accentClassName: "text-emerald-200",
    art: String.raw`
               .o+
               ooo/
              +oooo:
             +oooooo:
           -+oooooo+:
         /:-:++oooo+:
        /++++/+++++++:
       /++++++++++++++:
      /+++ooooooooooooo/
     ./ooosssso++osssssso+
    .oossssso-    /sssssssso.
   -osssssso.      :sssssssss.
  :osssssss/        osssso+++.
 /ossssssss/        +ssssooo/-
/ossssso+/:-        -:/+osssso+-
`.trim(),
  },
  unknown: {
    badgeLabel: "Machine",
    badgeClassName: "border-white/10 bg-white/[0.05] text-white/70",
    panelClassName: "border-white/10 bg-white/[0.04]",
    artClassName: "text-white/75",
    accentClassName: "text-white",
    art: String.raw`
   ________
  / ____  /|
 / /___/ / |
|  ____  | |
| |    | | /
|_|____|_|/
`.trim(),
  },
};

export function AgentPlatformArt({ agent, className }: AgentPlatformArtProps) {
  const normalizedOs = String(agent.os || "").toLowerCase();
  const key = normalizedOs.includes("win")
    ? "windows"
    : normalizedOs.includes("mac")
      ? "macos"
      : normalizedOs.includes("linux")
        ? "linux"
        : "unknown";
  const theme = PLATFORM_THEMES[key] ?? PLATFORM_THEMES.unknown;
  const label = getOsLabel(agent.os);
  const status = getAgentStatus(agent.lastHeartbeatAt);
  const heading = key === "windows" ? "winfetch" : "fastfetch";
  const lines = [
    { key: "os", value: getOsLabel(agent.os) },
    { key: "agent", value: agent.name },
    { key: "ip", value: agent.ipAddress || "неизвестно" },
    { key: "heartbeat", value: getRelativeHeartbeatLabel(agent.lastHeartbeatAt) },
    { key: "status", value: status },
    { key: "port", value: agent.port || "не задан" },
  ];

  return (
    <div className={cn("rounded-[1.9rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.24)]", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">Система</div>
          <div className="mt-2 break-words text-xl font-semibold text-white">{label}</div>
          <div className={cn("mt-2 text-sm", theme.accentClassName)}>
            {agent.ipAddress || getOsLabel(agent.os)}
          </div>
        </div>
        <div className={cn("rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]", theme.badgeClassName)}>
          {theme.badgeLabel}
        </div>
      </div>

      <div className={cn("mt-4 rounded-[1.45rem] border", theme.panelClassName)}>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
          <span className="ml-2 text-[11px] uppercase tracking-[0.2em] text-white/35">{heading}</span>
        </div>

        <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]">
          <pre className={cn("overflow-x-auto font-mono text-[10px] leading-4 sm:text-xs sm:leading-5", theme.artClassName)}>
            {theme.art}
          </pre>

          <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-4 font-mono text-xs text-white/75">
            <div className={cn("mb-3 font-semibold", theme.accentClassName)}>
              {agent.name}@syseye
            </div>
            {lines.map((line) => (
              <div key={line.key}>
                <span className="inline-block min-w-24 text-white/35">{line.key}</span>
                {line.value}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
