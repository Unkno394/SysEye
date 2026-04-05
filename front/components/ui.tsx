import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line bg-panel/90 shadow-glow backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: "online" | "offline" | "busy" | "queued" | "success" | "error" | "running" | "cancelled" | "interrupted" | "sent" }) {
  const styles = {
    online: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    offline: "border-white/10 bg-white/5 text-white/50",
    busy: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    queued: "border-violet-400/25 bg-violet-400/10 text-violet-300",
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    error: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    running: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    cancelled: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    interrupted: "border-orange-400/25 bg-orange-400/10 text-orange-300",
    sent: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  } as const;

  const labels = {
    online: "онлайн",
    offline: "оффлайн",
    busy: "занят",
    queued: "в очереди",
    success: "успешно",
    error: "ошибка",
    running: "выполняется",
    cancelled: "отменена",
    interrupted: "прервана",
    sent: "отправлена",
  } as const;

  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", styles[status])}>{labels[status]}</span>;
}

export function PrimaryButton({
  children,
  className,
  href,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}) {
  const base = cn(
    "inline-flex items-center justify-center rounded-2xl border border-accent/25 bg-accent/12 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60",
    className,
  );

  if (href) {
    return <Link href={href} className={base}>{children}</Link>;
  }

  return <button type={type} onClick={onClick} disabled={disabled} className={base}>{children}</button>;
}
