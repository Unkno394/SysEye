import Link from "next/link";
import { ArrowRight, ShieldCheck, TerminalSquare, Waves } from "lucide-react";
import { AppBrand } from "@/components/app-brand";
import FaultyTerminal from "@/components/faulty-terminal";

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

const features = [
  {
    title: "Агенты и heartbeat",
    description: "Онлайн-статусы, переподключение машин и контроль доступности в одном месте.",
    icon: Waves,
  },
  {
    title: "Команды и диагностика",
    description: "Запуск сохранённых команд и сценариев с историей выполнения и логами.",
    icon: TerminalSquare,
  },
  {
    title: "Контроль доступа",
    description: "JWT, cookie-сессии, подтверждение почты и базовые механизмы безопасности.",
    icon: ShieldCheck,
  },
] as const;

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050c12]">
      <div className="absolute inset-0 opacity-70">
        <FaultyTerminal {...terminalBackgroundProps} />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,255,179,0.16),transparent_35%),linear-gradient(180deg,rgba(3,8,12,0.22),rgba(3,8,12,0.9))]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="flex items-center justify-between rounded-[1.8rem] border border-white/8 bg-black/20 px-4 py-4 backdrop-blur-sm sm:px-6">
          <AppBrand />
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white">
              Войти
            </Link>
            <Link href="/register" className="rounded-2xl border border-accent/25 bg-accent/12 px-4 py-2 text-sm text-accent transition hover:bg-accent/18">
              Регистрация
            </Link>
          </div>
        </header>

        <main className="flex flex-1 items-center py-8 sm:py-12">
          <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
            <section className="rounded-[2rem] border border-white/8 bg-black/20 p-6 backdrop-blur-sm sm:p-8">
              <div className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent/80">
                SysEye Control Center
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Платформа для удалённой диагностики агентов и управления командами.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
                Здесь можно следить за машинами, запускать диагностику, смотреть историю выполнения, получать логи и
                контролировать состояние агентов в реальном времени.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent/25 bg-accent/12 px-5 py-3 text-sm font-medium text-accent transition hover:bg-accent/18"
                >
                  Открыть консоль <ArrowRight size={16} />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Перейти в dashboard
                </Link>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {features.map(({ title, description, icon: Icon }) => (
                  <div key={title} className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                      <Icon size={18} />
                    </div>
                    <div className="mt-4 text-sm font-medium text-white">{title}</div>
                    <div className="mt-2 text-sm leading-6 text-white/55">{description}</div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="rounded-[2rem] border border-white/8 bg-black/20 p-6 backdrop-blur-sm sm:p-8">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Что внутри</div>
              <div className="mt-5 space-y-4">
                <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">Мониторинг машин</div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Online/offline-статусы, last heartbeat, доступность и быстрый переход к нужному агенту.
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">История и логи</div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Выполнения команд, stdout/stderr, execution logs и разбор проблем без ручного SSH.
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-sm font-medium text-white">Сценарии запуска</div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Системные и пользовательские команды, групповой запуск и базовая операционная аналитика.
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
