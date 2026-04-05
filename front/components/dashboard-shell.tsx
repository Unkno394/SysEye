"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Computer, LogOut, Settings2, TerminalSquare } from "lucide-react";
import { AppBrand } from "@/components/app-brand";
import FaultyTerminal from "@/components/faulty-terminal";
import { apiFetch, apiJson } from "@/lib/api-client";
import type { UserInfo } from "@/lib/backend-types";
import { clearSessionProfile, getSessionProfile } from "@/lib/session-profile";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Agents", icon: Computer },
  { href: "/dashboard/terminal", label: "Commands", icon: TerminalSquare },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];

const terminalBackgroundProps = {
  tint: "#5cffb5",
  gridMul: [2.2, 1.4] as [number, number],
  digitSize: 1.35,
  timeScale: 0.28,
  noiseAmp: 0.85,
  scanlineIntensity: 0.35,
  glitchAmount: 1.08,
  flickerAmount: 0.65,
  curvature: 0.16,
  dither: 0.5,
  brightness: 0.9,
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const user = await apiJson<UserInfo>("/api/hackaton/user/info", { method: "GET" }, "Не удалось загрузить данные пользователя.");
        if (cancelled) return;

        const sessionProfile = getSessionProfile();
        setUserName(typeof user?.name === "string" ? user.name : "");
        setUserEmail(
          typeof user?.email === "string" && user.email
            ? user.email
            : typeof user?.login === "string"
              ? user.login
              : typeof sessionProfile.email === "string"
                ? sessionProfile.email
                : "",
        );
        if (!user?.name && sessionProfile.name) {
          setUserName(sessionProfile.name);
        }
      } catch {
        if (!cancelled) {
          const sessionProfile = getSessionProfile();
          setUserName(sessionProfile.name ?? "");
          setUserEmail(sessionProfile.email ?? "");
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setLoggingOut(true);

    try {
      await apiFetch("/api/hackaton/auth/logout", { method: "POST" }, false);
    } finally {
      clearSessionProfile();
      setLoggingOut(false);
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050c12]">
      <div className="absolute inset-0 opacity-70">
        <FaultyTerminal {...terminalBackgroundProps} />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,255,179,0.16),transparent_35%),linear-gradient(180deg,rgba(3,8,12,0.18),rgba(3,8,12,0.85))]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:gap-6 lg:px-6">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 rounded-[2rem] border border-line bg-black/20 p-5 backdrop-blur-sm lg:flex lg:flex-col">
          <div>
            <Link href="/dashboard" className="block rounded-2xl border border-white/8 bg-white/5 p-3 transition hover:border-line hover:bg-white/[0.07]">
              <AppBrand />
            </Link>

            <nav className="mt-8 space-y-1.5">
              {nav.map(({ href, label, icon: Icon }) => {
                const isActive = href === "/dashboard"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                      isActive
                        ? "border-line bg-white/8 text-white"
                        : "border-transparent text-white/70 hover:border-line hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-white/65">
            <div className="font-medium text-white">{userName || "Operator"}</div>
            <div className="mt-1">{userEmail || "Нет данных профиля"}</div>
            <Link href="/login" onClick={handleLogout} className="mt-4 inline-flex items-center gap-2 text-accent transition hover:text-white">
              <LogOut size={16} /> {loggingOut ? "Выход..." : "Выйти"}
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 rounded-[1.4rem] border border-white/8 bg-black/20 p-3 backdrop-blur-sm sm:rounded-[1.75rem] sm:p-4 lg:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/dashboard" className="transition hover:opacity-90">
                <AppBrand compact />
              </Link>
              <Link href="/login" onClick={handleLogout} className="inline-flex items-center gap-2 text-sm text-accent transition hover:text-white">
                <LogOut size={16} /> {loggingOut ? "Выход..." : "Выйти"}
              </Link>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {nav.map(({ href, label }) => {
                const isActive = href === "/dashboard"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm whitespace-nowrap transition",
                      isActive
                        ? "border-line bg-white/8 text-white"
                        : "border-white/8 bg-white/[0.03] text-white/70 hover:text-white",
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
