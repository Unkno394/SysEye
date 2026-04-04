"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, PencilLine, RefreshCw, Trash2 } from "lucide-react";
import { GlassCard, PrimaryButton, StatusBadge } from "@/components/ui";
import { TerminalPanel } from "@/components/terminal-panel";
import { apiJson } from "@/lib/api-client";
import type { AgentDto, CommandDto, PagedResult } from "@/lib/backend-types";
import { getAgentStatus, getOsLabel, getRelativeHeartbeatLabel } from "@/lib/backend-types";

export default function AgentDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params.id;

  const [agent, setAgent] = useState<AgentDto | null>(null);
  const [commands, setCommands] = useState<CommandDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editName, setEditName] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const loadedAgent = await apiJson<AgentDto>(`/api/hackaton/agent/${agentId}`, { method: "GET" }, "Не удалось загрузить агента.");
      setAgent(loadedAgent);
      setEditName(loadedAgent.name);

      try {
        const commandsData = await apiJson<PagedResult<CommandDto>>("/api/hackaton/command?take=100&skip=0", { method: "GET" });
        setCommands(commandsData.items ?? []);
      } catch {
        setCommands([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные агента.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) {
      loadData();
    }
  }, [agentId]);

  const status = useMemo(() => (agent ? getAgentStatus(agent.lastHeartbeatAt) : "offline"), [agent]);

  const handleSave = async () => {
    if (!agent) return;
    setEditing(true);
    setError(null);

    try {
      await apiJson<void>(
        `/api/hackaton/agent/${agent.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: editName,
          }),
        },
        "Не удалось обновить агента.",
      );

      setEditOpen(false);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить агента.");
    } finally {
      setEditing(false);
    }
  };

  const handleHeartbeat = async () => {
    if (!agent) return;
    setHeartbeatLoading(true);
    setError(null);

    try {
      await apiJson(`/api/hackaton/agent/${agent.id}/heartbeat`, { method: "POST" }, "Не удалось обновить heartbeat.");
      await loadData();
    } catch (heartbeatError) {
      setError(heartbeatError instanceof Error ? heartbeatError.message : "Не удалось обновить heartbeat.");
    } finally {
      setHeartbeatLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    setDeleteLoading(true);
    setError(null);

    try {
      await apiJson(`/api/hackaton/agent/${agent.id}`, { method: "DELETE" }, "Не удалось удалить агента.");
      router.push("/dashboard");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <GlassCard className="p-8 text-center text-white/55">Загрузка агента...</GlassCard>;
  }

  if (error && !agent) {
    return <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-8 text-center text-rose-100/90">{error}</GlassCard>;
  }

  if (!agent) {
    return <GlassCard className="p-8 text-center text-white/55">Агент не найден.</GlassCard>;
  }

  const machineDetails = [getOsLabel(agent.os), agent.ipAddress || null].filter(Boolean).join(" · ");
  return (
    <div className="space-y-6 pb-10">
      <GlassCard className="p-6 sm:p-8">
        <div className="space-y-6">
          <div className="min-w-0">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-accent">
              <ChevronLeft size={16} /> Back to agents
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="break-words text-3xl font-semibold text-white">{agent.name}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="mt-2 text-white/55">{machineDetails || "Параметры машины появятся позже."}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
              Здесь можно обновить данные агента, удалить запись, отправить heartbeat и запускать сохранённые команды.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition hover:bg-white/10 sm:w-auto"
              >
                <PencilLine size={16} />
                Редактировать
              </button>
              <button
                type="button"
                onClick={handleHeartbeat}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent transition hover:bg-accent/15 sm:w-auto"
              >
                <RefreshCw size={16} className={heartbeatLoading ? "animate-spin" : ""} />
                {heartbeatLoading ? "Обновление..." : "Heartbeat"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-400/15 sm:w-auto"
              >
                <Trash2 size={16} />
                {deleteLoading ? "Удаление..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Статус агента</div>
          <div className="mt-3">
            <StatusBadge status={status} />
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Last heartbeat</div>
          <div className="mt-3 text-2xl font-semibold text-white">{getRelativeHeartbeatLabel(agent.lastHeartbeatAt)}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Команд доступно</div>
          <div className="mt-3 text-2xl font-semibold text-white">{commands.length}</div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="text-sm text-white/55">Параметры машины</div>
          <div className="mt-3 text-lg font-semibold text-white">{machineDetails || "Пока нет данных"}</div>
        </GlassCard>
      </div>

      {error ? (
        <GlassCard className="border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100/90">{error}</GlassCard>
      ) : null}

      <TerminalPanel agent={agent} commands={commands} />

      {editOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#02070bcc]/80 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center">
          <div className="w-full max-w-xl rounded-[1.6rem] border border-white/10 bg-[#101821]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[1.9rem] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-white">Редактирование агента</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">Здесь можно изменить имя машины.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:text-white"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Имя машины" value={editName} onChange={setEditName} placeholder="Имя машины" />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton onClick={handleSave} disabled={editing || !editName.trim()}>
                {editing ? "Сохранение..." : "Сохранить"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
              >
                Отмена
              </button>
            </div>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-white/60">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25"
      />
    </div>
  );
}
