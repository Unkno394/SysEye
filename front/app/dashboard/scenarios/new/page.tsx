import Link from "next/link";
import { ChevronLeft, GripVertical } from "lucide-react";
import { SelectFieldUI } from "@/components/select-field-ui";
import { GlassCard, PrimaryButton, SectionTitle } from "@/components/ui";
import { commandTemplates } from "@/lib/mock-data";

export default function NewScenarioPage() {
  return (
    <div className="space-y-6 pb-10">
      <div>
        <Link href="/dashboard/terminal" className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-accent">
          <ChevronLeft size={16} /> Back to commands
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-white">Создание пользовательского сценария</h1>
        <p className="mt-2 max-w-3xl text-white/55">
          Сценарий — это набор команд, которые будут выполняться последовательно на выбранном агенте.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <GlassCard className="p-6">
          <SectionTitle title="Метаданные сценария" subtitle="Описание, имя и базовые настройки запуска." />
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-white/60">Название сценария</label>
              <input className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-white outline-none focus:border-accent/25" placeholder="Например: Проверка жизнеспособности Linux-ноды" />
            </div>
            <div>
              <label className="mb-2 block text-sm text-white/60">Описание</label>
              <textarea rows={5} className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-white outline-none focus:border-accent/25" placeholder="Коротко опиши, что делает сценарий и на каких ПК он полезен." />
            </div>
            <div>
              <label className="mb-2 block text-sm text-white/60">Политика ошибок</label>
              <SelectFieldUI
                className="rounded-2xl bg-white/5"
                options={["Остановить сценарий при первой ошибке", "Продолжать и собирать все ответы"]}
              />
            </div>
            <PrimaryButton className="w-full">Сохранить сценарий</PrimaryButton>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <SectionTitle title="Конструктор шагов" subtitle="Готовые команды можно переиспользовать, а пользовательские — сохранять в БД и добавлять в сценарии." />
          <div className="space-y-4">
            {commandTemplates.map((command, index) => (
              <div key={command.id} className="grid gap-4 rounded-3xl border border-white/8 bg-white/5 p-4 md:grid-cols-[auto_1fr_auto] md:items-start">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/50">
                  <GripVertical size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <div className="font-medium text-white">{index + 1}. {command.name}</div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/45">{command.category}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/55">{command.description}</p>
                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3 text-xs text-[#9af7c8]">
                    {command.windowsCommand} / {command.linuxCommand}
                  </div>
                </div>
                <button className="rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-accent transition hover:bg-accent/15">
                  Add step
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
