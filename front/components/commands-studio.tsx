"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, Search, TerminalSquare, Trash2 } from "lucide-react";
import { SelectFieldUI } from "@/components/select-field-ui";
import { GlassCard, PrimaryButton, SectionTitle } from "@/components/ui";
import { apiJson } from "@/lib/api-client";
import { loadAllCommands } from "@/lib/commands";
import type {
  CommandDto,
  CommandPlaceholderDto,
  PagedResult,
  ScenarioDetailsDto,
  ScenarioDto,
} from "@/lib/backend-types";
import { cn } from "@/lib/utils";

type FilterValue = "all" | "system" | "custom";
type Mode = "new-command" | "edit-command" | "new-scenario";
type ScenarioPlatform = "all" | "linux" | "windows";
type CommandPlatform = "linux" | "windows";
type CommandKind = "plain" | "template";

type CommandDraft = {
  id?: string;
  name: string;
  description: string;
  bashScript: string;
  powerShellScript: string;
  isSystem: boolean;
};

type EditablePlaceholder = {
  index: number;
  name: string;
};

type ScenarioStep = {
  id: string;
  commandId: string;
  title: string;
  description: string;
  platform: ScenarioPlatform;
  script: string;
};

const emptyDraft: CommandDraft = {
  name: "",
  description: "",
  bashScript: "",
  powerShellScript: "",
  isSystem: false,
};

export function CommandsStudio() {
  const [commands, setCommands] = useState<CommandDto[]>([]);
  const [placeholders, setPlaceholders] = useState<CommandPlaceholderDto[]>([]);
  const [loadedPlaceholders, setLoadedPlaceholders] = useState<CommandPlaceholderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [mode, setMode] = useState<Mode>("new-command");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioDto[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [selectedScenarioIsSystem, setSelectedScenarioIsSystem] = useState(false);
  const [draft, setDraft] = useState<CommandDraft>(emptyDraft);
  const [commandPlatform, setCommandPlatform] = useState<CommandPlatform>("linux");
  const [commandKind, setCommandKind] = useState<CommandKind>("plain");
  const [commandScript, setCommandScript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [scenarioPlatform, setScenarioPlatform] = useState<ScenarioPlatform>("all");
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStep[]>([]);

  const loadCommands = async () => {
    setLoading(true);

    try {
      const data = await apiJson<PagedResult<CommandDto>>("/api/hackaton/command?take=100&skip=0", { method: "GET" }, "Не удалось загрузить команды.");
      setCommands(await loadAllCommands("Не удалось загрузить команды."));

      /* if (data.totalCount > items.length) {
        const fullData = await apiJson<PagedResult<CommandDto>>(
          `/api/hackaton/command?take=${Math.max(COMMANDS_FETCH_LIMIT, data.totalCount)}&skip=0`,
          { method: "GET" },
          "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєРѕРјР°РЅРґС‹.",
        );
        setCommands(fullData.items ?? items);
      } */
    } catch {
      setCommands([]);
    } finally {
      setLoading(false);
    }
  };

  const loadScenarios = async () => {
    setScenariosLoading(true);

    try {
      const data = await apiJson<PagedResult<ScenarioDto>>("/api/hackaton/scenario?take=100&skip=0", { method: "GET" }, "Не удалось загрузить сценарии.");
      setScenarios((data.items ?? []).map((item) => ({ ...item, isSystem: Boolean(item.isSystem) })));
    } catch {
      setScenarios([]);
    } finally {
      setScenariosLoading(false);
    }
  };

  const loadPlaceholders = async (commandId: string) => {
    try {
      const data = await apiJson<CommandPlaceholderDto[]>(`/api/hackaton/command/${commandId}/placeholders`, { method: "GET" }, "Не удалось загрузить плейсхолдеры.");
      setPlaceholders(data ?? []);
      setLoadedPlaceholders(data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить плейсхолдеры.");
      setPlaceholders([]);
      setLoadedPlaceholders([]);
    }
  };

  useEffect(() => {
    void loadCommands();
    void loadScenarios();
  }, []);

  useEffect(() => {
    if (mode === "edit-command" && draft.id) {
      loadPlaceholders(draft.id);
      return;
    }

    setPlaceholders([]);
    setLoadedPlaceholders([]);
  }, [draft.id, mode]);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return commands.filter((command) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "system" && command.isSystem) ||
        (filter === "custom" && !command.isSystem);

      if (!matchesFilter) return false;
      if (!normalized) return true;

      return `${command.name} ${command.description} ${command.bashScript} ${command.powerShellScript}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [commands, filter, query]);

  const commandLibrary = useMemo(() => {
    return commands.map((command) => {
      const hasBash = Boolean(command.bashScript?.trim());
      const hasPowerShell = Boolean(command.powerShellScript?.trim());
      const platform: ScenarioPlatform = hasPowerShell && !hasBash ? "windows" : "linux";
      const script = hasPowerShell && !hasBash ? command.powerShellScript : command.bashScript || command.powerShellScript;

      return {
        ...command,
        platform,
        script,
      };
    });
  }, [commands]);

  const scenarioCommandLibrary = useMemo(() => {
    return commandLibrary.filter((command) => {
      const script = command.script?.trim();
      return Boolean(script) && !hasPlaceholderTokens(script);
    });
  }, [commandLibrary]);

  const filteredScenarioCommands = useMemo(() => {
    const normalized = scenarioQuery.trim().toLowerCase();

    return scenarioCommandLibrary.filter((command) => {
      const matchesPlatform = scenarioPlatform === "all" || command.platform === scenarioPlatform;
      if (!matchesPlatform) return false;
      if (!normalized) return true;

      return `${command.name} ${command.description} ${command.script}`.toLowerCase().includes(normalized);
    });
  }, [scenarioCommandLibrary, scenarioPlatform, scenarioQuery]);

  const openNewCommand = () => {
    setMode("new-command");
    setSelectedId(null);
    setDraft(emptyDraft);
    setCommandPlatform("linux");
    setCommandKind("plain");
    setCommandScript("");
    setPlaceholders([]);
    setLoadedPlaceholders([]);
    setError(null);
    setMessage(null);
  };

  const openNewScenario = () => {
    setMode("new-scenario");
    setSelectedScenarioId(null);
    setSelectedScenarioIsSystem(false);
    setScenarioName("");
    setScenarioDescription("");
    setScenarioSteps([]);
    setScenarioQuery("");
    setScenarioPlatform("all");
    setError(null);
    setMessage(null);
  };

  const openScenario = async (scenarioId: string) => {
    setMode("new-scenario");
    setSelectedScenarioId(scenarioId);
    setSelectedScenarioIsSystem(false);
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const details = await apiJson<ScenarioDetailsDto>(
        `/api/hackaton/scenario/${scenarioId}`,
        { method: "GET" },
        "Не удалось загрузить сценарий.",
      );

      const commandMap = new Map(commandLibrary.map((command) => [command.id, command]));
      setSelectedScenarioIsSystem(Boolean(details.isSystem));
      setScenarioName(details.name);
      setScenarioDescription(details.description);
      setScenarioSteps(
        (details.commands ?? [])
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((command, index) => {
            const libraryCommand = commandMap.get(command.commandId);

            return {
              id: `${command.commandId}-${index + 1}`,
              commandId: command.commandId,
              title: command.commandName || libraryCommand?.name || "Команда",
              description: libraryCommand?.description || "Описание не задано.",
              platform: libraryCommand?.platform ?? "linux",
              script: libraryCommand?.script || "Команда сейчас недоступна.",
            };
          }),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить сценарий.");
    } finally {
      setSaving(false);
    }
  };

  const openCommand = (commandId: string) => {
    const command = commands.find((item) => item.id === commandId);
    if (!command) return;

    setMode("edit-command");
    setSelectedId(commandId);
    setDraft({
      id: command.id,
      name: command.name,
      description: command.description,
      bashScript: command.bashScript,
      powerShellScript: command.powerShellScript,
      isSystem: command.isSystem,
    });
    setCommandPlatform(inferCommandPlatform(command.bashScript, command.powerShellScript));
    setCommandKind(hasPlaceholderTokens(getSingleCommandValue(command.bashScript, command.powerShellScript)) ? "template" : "plain");
    setCommandScript(getSingleCommandValue(command.bashScript, command.powerShellScript));
    setError(null);
    setMessage(null);
  };

  const saveCommand = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const normalizedScript = commandScript.trim();
    const { bashScript, powerShellScript } = mapCommandByPlatform(commandPlatform, normalizedScript);
    const normalizedPlaceholders = commandKind === "template" ? normalizePlaceholders(placeholders) : [];

    if (commandKind === "template") {
      if (!normalizedPlaceholders.length) {
        setSaving(false);
        setError("Для команды с параметрами добавь хотя бы один плейсхолдер.");
        return;
      }

      if (!hasPlaceholderTokens(normalizedScript)) {
        setSaving(false);
        setError("В шаблоне нет токенов. Добавь в команду что-то вроде ping $1.");
        return;
      }
    }

    try {
      if (mode === "edit-command" && draft.id) {
        await apiJson<void>(
          `/api/hackaton/command/${draft.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: draft.name,
              description: draft.description,
              bashScript,
              powerShellScript,
            }),
          },
          "Не удалось обновить команду.",
        );

        await syncPlaceholders(draft.id, loadedPlaceholders, normalizedPlaceholders);

        setMessage("Команда обновлена.");
      } else {
        const createdId = await apiJson<string>(
          "/api/hackaton/command",
          {
            method: "POST",
            body: JSON.stringify({
              name: draft.name,
              description: draft.description,
              bashScript,
              powerShellScript,
            }),
          },
          "Не удалось создать команду.",
        );

        await syncPlaceholders(createdId, [], normalizedPlaceholders);

        setMessage("Команда создана.");
        setDraft(emptyDraft);
        setCommandPlatform("linux");
        setCommandKind("plain");
        setCommandScript("");
        setPlaceholders([]);
        setLoadedPlaceholders([]);
        setSelectedId(null);
      }

      await loadCommands();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить команду.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCommand = async () => {
    if (!draft.id) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiJson<void>(`/api/hackaton/command/${draft.id}`, { method: "DELETE" }, "Не удалось удалить команду.");
      setMessage("Команда удалена.");
      openNewCommand();
      await loadCommands();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить команду.");
    } finally {
      setSaving(false);
    }
  };

  const addPlaceholderRow = () => {
    const nextIndex = getNextPlaceholderIndex(placeholders);
    setPlaceholders((prev) => [...prev, { index: nextIndex, name: "" }]);
  };

  const updatePlaceholderName = (index: number, name: string) => {
    setPlaceholders((prev) => prev.map((item) => (item.index === index ? { ...item, name } : item)));
  };

  const removePlaceholderRow = (index: number) => {
    setPlaceholders((prev) => prev.filter((item) => item.index !== index));
  };

  const insertPlaceholderToken = (index: number) => {
    setCommandScript((prev) => `${prev}${prev.endsWith(" ") || !prev ? "" : " "}$${index}`.trim());
  };

  const syncPlaceholders = async (
    commandId: string,
    currentPlaceholders: CommandPlaceholderDto[],
    nextPlaceholders: EditablePlaceholder[],
  ) => {
    const currentMap = new Map(currentPlaceholders.map((item) => [item.index, item.name]));
    const nextMap = new Map(nextPlaceholders.map((item) => [item.index, item.name]));

    for (const [index, name] of nextMap.entries()) {
      if (!currentMap.has(index)) {
        await apiJson(
          `/api/hackaton/command/${commandId}/placeholders`,
          {
            method: "POST",
            body: JSON.stringify({ index, name }),
          },
          "Не удалось добавить плейсхолдер.",
        );
        continue;
      }

      if (currentMap.get(index) !== name) {
        await apiJson(
          `/api/hackaton/command/${commandId}/placeholders/${index}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name }),
          },
          "Не удалось обновить плейсхолдер.",
        );
      }
    }

    for (const [index] of currentMap.entries()) {
      if (!nextMap.has(index)) {
        await apiJson(
          `/api/hackaton/command/${commandId}/placeholders/${index}`,
          { method: "DELETE" },
          "Не удалось удалить плейсхолдер.",
        );
      }
    }

    if (mode === "edit-command") {
      await loadPlaceholders(commandId);
    }
  };

  const addScenarioCommand = (command: (typeof commandLibrary)[number]) => {
    if (selectedScenarioIsSystem) return;

    if (scenarioSteps.some((step) => step.commandId === command.id)) {
      setMessage("Команда уже добавлена в сценарий.");
      return;
    }

    setScenarioSteps((prev) => [
      ...prev,
      {
        id: `${command.id}-${Date.now()}`,
        commandId: command.id,
        title: command.name,
        description: command.description || "Описание не задано.",
        platform: command.platform,
        script: command.script || "Команда не задана.",
      },
    ]);
  };

  const moveScenarioStep = (index: number, direction: -1 | 1) => {
    if (selectedScenarioIsSystem) return;

    setScenarioSteps((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      const [current] = next.splice(index, 1);
      next.splice(nextIndex, 0, current);
      return next;
    });
  };

  const removeScenarioStep = (id: string) => {
    if (selectedScenarioIsSystem) return;

    setScenarioSteps((prev) => prev.filter((step) => step.id !== id));
  };

  const syncScenarioCommands = async (scenarioId: string) => {
    const current = await apiJson<ScenarioDetailsDto>(
      `/api/hackaton/scenario/${scenarioId}`,
      { method: "GET" },
      "Не удалось синхронизировать сценарий.",
    );

    const currentMap = new Map((current.commands ?? []).map((item) => [item.commandId, item.order]));
    const nextMap = new Map(scenarioSteps.map((step, index) => [step.commandId, index + 1]));

    for (const commandId of currentMap.keys()) {
      if (!nextMap.has(commandId)) {
        await apiJson<void>(
          `/api/hackaton/scenario/${scenarioId}/commands/${commandId}`,
          { method: "DELETE" },
          "Не удалось удалить команду из сценария.",
        );
      }
    }

    for (const [commandId, order] of nextMap.entries()) {
      if (!currentMap.has(commandId)) {
        await apiJson<string>(
          `/api/hackaton/scenario/${scenarioId}/commands`,
          {
            method: "POST",
            body: JSON.stringify({ commandId, order }),
          },
          "Не удалось добавить команду в сценарий.",
        );
        continue;
      }

      if (currentMap.get(commandId) !== order) {
        await apiJson<void>(
          `/api/hackaton/scenario/${scenarioId}/commands/${commandId}?order=${order}`,
          { method: "PATCH" },
          "Не удалось обновить порядок команд.",
        );
      }
    }
  };

  const saveScenario = async () => {
    if (selectedScenarioIsSystem) {
      setError("Системный сценарий нельзя редактировать.");
      return;
    }

    if (!scenarioName.trim()) {
      setError("Укажи название сценария.");
      return;
    }

    if (!scenarioSteps.length) {
      setError("Добавь хотя бы одну команду в сценарий.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      let scenarioId = selectedScenarioId;

      if (scenarioId) {
        await apiJson<void>(
          `/api/hackaton/scenario/${scenarioId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: scenarioName,
              description: scenarioDescription,
            }),
          },
          "Не удалось обновить сценарий.",
        );
      } else {
        scenarioId = await apiJson<string>(
          "/api/hackaton/scenario",
          {
            method: "POST",
            body: JSON.stringify({
              name: scenarioName,
              description: scenarioDescription,
            }),
          },
          "Не удалось создать сценарий.",
        );
        setSelectedScenarioId(scenarioId);
      }

      await syncScenarioCommands(scenarioId);
      await loadScenarios();
      setMessage(selectedScenarioId ? "Сценарий обновлён." : "Сценарий создан.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить сценарий.");
    } finally {
      setSaving(false);
    }
  };

  const deleteScenario = async () => {
    if (!selectedScenarioId) return;
    if (selectedScenarioIsSystem) {
      setError("Системный сценарий нельзя удалить.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiJson<void>(
        `/api/hackaton/scenario/${selectedScenarioId}`,
        { method: "DELETE" },
        "Не удалось удалить сценарий.",
      );
      await loadScenarios();
      setMessage("Сценарий удалён.");
      openNewScenario();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить сценарий.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.8rem] font-semibold text-white">Команды и сценарии</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-white/55">
              Создавай команды и собирай из них сценарии.
            </p>
          </div>

          <div className="flex w-full rounded-2xl border border-white/10 bg-white/[0.03] p-1 sm:w-auto">
            <button
              type="button"
              onClick={openNewCommand}
              className={cn(
                "flex-1 rounded-xl px-4 py-2.5 text-sm transition sm:flex-none",
                mode === "new-command" || mode === "edit-command"
                  ? "bg-accent/12 text-accent"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Новая команда
              </span>
            </button>
            <button
              type="button"
              onClick={openNewScenario}
              className={cn(
                "flex-1 rounded-xl px-4 py-2.5 text-sm transition sm:flex-none",
                mode === "new-scenario"
                  ? "bg-accent/12 text-accent"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <FolderKanban size={16} />
                Новый сценарий
              </span>
            </button>
          </div>
        </div>
      </GlassCard>

      {mode === "new-scenario" ? (
        <div className="grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
          <GlassCard className="p-4">
            <SectionTitle
              title={selectedScenarioId ? "Редактирование сценария" : "Новый сценарий"}
              subtitle="Собери последовательность шагов из сохранённых команд."
            />

            <div className="space-y-4">
              {error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{error}</div>
              ) : null}
              {message ? (
                <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">{message}</div>
              ) : null}
              {selectedScenarioIsSystem ? (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100/90">
                  Системный сценарий доступен всем пользователям и открыт только для просмотра.
                </div>
              ) : null}

              <Field
                label="Название сценария"
                value={scenarioName}
                placeholder="Например: Первичная проверка Linux-ноды"
                onChange={setScenarioName}
              />

              <TextAreaField
                label="Описание"
                value={scenarioDescription}
                placeholder="Что проверяет этот сценарий"
                rows={3}
                onChange={setScenarioDescription}
              />

              <div className="rounded-[1.6rem] border border-white/8 bg-black/20 p-4">
                <div className="mb-3 text-sm font-medium text-white">Сценарии</div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openNewScenario}
                    className={cn(
                      "block w-full rounded-[1.2rem] border px-3.5 py-3 text-left transition",
                      !selectedScenarioId
                        ? "border-line bg-white/8"
                        : "border-white/8 bg-white/5 hover:border-line hover:bg-white/[0.07]",
                    )}
                  >
                    <div className="font-medium text-white">Новый сценарий</div>
                    <p className="mt-2 text-sm leading-5 text-white/55">Создай новый сценарий из сохранённых команд.</p>
                  </button>

                  <div className="terminal-scroll max-h-[28svh] space-y-2 overflow-y-auto pr-1 xl:max-h-[240px]">
                    {scenariosLoading ? (
                      <div className="rounded-[1.3rem] border border-white/8 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                        Загрузка сценариев...
                      </div>
                    ) : scenarios.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void openScenario(item.id)}
                        className={cn(
                          "block w-full rounded-[1.2rem] border px-3.5 py-3 text-left transition",
                          selectedScenarioId === item.id
                            ? "border-line bg-white/8"
                            : "border-white/8 bg-white/5 hover:border-line hover:bg-white/[0.07]",
                        )}
                      >
                        <div className="truncate font-medium text-white">{item.name}</div>
                        <div className="mt-1 text-xs text-accent">{item.isSystem ? "Системный" : "Пользовательский"}</div>
                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/55">
                          {item.description || "Описание не задано."}
                        </p>
                      </button>
                    ))}

                    {!scenariosLoading && !scenarios.length ? (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                        Сценариев пока нет.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-white/8 bg-black/20 p-4">
                <div className="mb-3 text-sm font-medium text-white">Библиотека команд</div>
                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2.5">
                  <label className="flex items-center gap-3 text-sm text-white/55">
                    <Search size={16} className="text-accent" />
                    <input
                      value={scenarioQuery}
                      onChange={(event) => setScenarioQuery(event.target.value)}
                      placeholder="Поиск команды"
                      className="w-full bg-transparent text-white outline-none placeholder:text-white/25"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { value: "all", label: "Все" },
                    { value: "linux", label: "Linux" },
                    { value: "windows", label: "Windows" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setScenarioPlatform(item.value as ScenarioPlatform)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        scenarioPlatform === item.value
                          ? "border-accent/30 bg-accent/12 text-accent"
                          : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="terminal-scroll mt-3 max-h-[44svh] space-y-3 overflow-y-auto pr-1 xl:max-h-[520px]">
                  {filteredScenarioCommands.map((item) => (
                    <div key={item.id} className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{item.name}</div>
                          <div className="mt-1 text-xs text-accent">{getPlatformLabel(item.platform)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addScenarioCommand(item)}
                          disabled={selectedScenarioIsSystem}
                          className="rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent transition hover:bg-accent/15 sm:self-start"
                        >
                          + Добавить
                        </button>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-white/55">{item.description || "Описание не задано."}</p>
                    </div>
                  ))}

                  {!filteredScenarioCommands.length ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
                      Подходящих команд без параметров нет.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <SectionTitle
              title="Шаги сценария"
              subtitle="Порядок выполнения можно менять прямо в списке."
            />

            <div className="space-y-4">
              <div className="terminal-scroll max-h-[40svh] space-y-3 overflow-y-auto pr-1 xl:max-h-[400px]">
                {scenarioSteps.map((step, index) => (
                  <div key={step.id} className="rounded-[1.4rem] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-white">{index + 1}. {step.title}</span>
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/40">
                            {getPlatformLabel(step.platform)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-white/55">{step.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveScenarioStep(index, -1)}
                          disabled={selectedScenarioIsSystem}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 transition hover:text-white"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveScenarioStep(index, 1)}
                          disabled={selectedScenarioIsSystem}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 transition hover:text-white"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeScenarioStep(step.id)}
                          disabled={selectedScenarioIsSystem}
                          className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-400/15"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-[1.15rem] border border-white/8 bg-[#081018]">
                      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                        <span>terminal</span>
                        <span>{getPlatformLabel(step.platform)}</span>
                      </div>
                      <div className="px-4 py-3 font-mono text-sm text-[#9af7c8]">{step.script}</div>
                    </div>
                  </div>
                ))}

                {!scenarioSteps.length ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/40">
                    Добавь команды из библиотеки слева, чтобы собрать сценарий.
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <PrimaryButton onClick={saveScenario} disabled={saving || selectedScenarioIsSystem || !scenarioName.trim() || !scenarioSteps.length}>
                  {saving ? "Сохранение..." : selectedScenarioId ? "Сохранить сценарий" : "Создать сценарий"}
                </PrimaryButton>
                {selectedScenarioId && !selectedScenarioIsSystem ? (
                  <button
                    type="button"
                    onClick={deleteScenario}
                    className="inline-flex items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-400/15"
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            </div>
          </GlassCard>
        </div>
      ) : (
        <div className="grid gap-4 2xl:grid-cols-[320px_1fr]">
          <GlassCard className="p-3.5">
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2.5">
              <label className="flex items-center gap-3 text-sm text-white/55">
                <Search size={16} className="text-accent" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск команды"
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/25"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { value: "all", label: "Все" },
                { value: "system", label: "Системные" },
                { value: "custom", label: "Пользовательские" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value as FilterValue)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition",
                    filter === item.value
                      ? "border-accent/30 bg-accent/12 text-accent"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="terminal-scroll mt-3 max-h-[42svh] space-y-2 overflow-y-auto pr-1 md:max-h-[48svh] xl:max-h-[560px]">
              <button
                type="button"
                onClick={openNewCommand}
                className={cn(
                  "block w-full rounded-[1.2rem] border px-3.5 py-3 text-left transition",
                  !selectedId && mode === "new-command"
                    ? "border-line bg-white/8"
                    : "border-white/8 bg-white/5 hover:border-line hover:bg-white/[0.07]",
                )}
              >
                <div className="font-medium text-white">Новая команда</div>
                <p className="mt-2 text-sm leading-5 text-white/55">Создай новую пользовательскую команду.</p>
              </button>

              {loading ? (
                <div className="rounded-[1.3rem] border border-white/8 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                  Загрузка команд...
                </div>
              ) : filteredCommands.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openCommand(item.id)}
                  className={cn(
                    "block w-full rounded-[1.2rem] border px-3.5 py-3 text-left transition",
                    selectedId === item.id
                      ? "border-line bg-white/8"
                      : "border-white/8 bg-white/5 hover:border-line hover:bg-white/[0.07]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{item.name}</div>
                      <div className="mt-0.5 text-xs text-accent">{item.isSystem ? "Системная" : "Пользовательская"}</div>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                      <TerminalSquare size={16} />
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/55">
                    {item.description || "Описание не задано."}
                  </p>
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="space-y-4">
              <SectionTitle
                title={draft.id ? "Редактирование команды" : "Новая команда"}
                subtitle="Создай или отредактируй команду."
              />

              {error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{error}</div>
              ) : null}
              {message ? (
                <div className="rounded-2xl border border-accent/15 bg-accent/[0.08] px-4 py-3 text-sm text-white/70">{message}</div>
              ) : null}

              <div className="grid gap-4 2xl:grid-cols-[0.95fr_0.85fr]">
                <div className="space-y-3.5">
                  <Field
                    label="Название"
                    value={draft.name}
                    placeholder="Например: Проверка диска"
                    onChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                  />

                  <TextAreaField
                    label="Описание"
                    value={draft.description}
                    placeholder="Показывает свободное место на дисках"
                    rows={3}
                    onChange={(value) => setDraft((prev) => ({ ...prev, description: value }))}
                  />

                  <div>
                    <label className="mb-2 block text-sm text-white/60">Платформа</label>
                    <SelectFieldUI
                      options={["Linux", "Windows"]}
                      defaultValue={getCommandPlatformLabel(commandPlatform)}
                      onChange={(value) => setCommandPlatform(parseCommandPlatform(value))}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-white/60">Тип команды</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "plain", label: "Обычная команда" },
                        { value: "template", label: "Команда с параметрами" },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setCommandKind(item.value as CommandKind)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition",
                            commandKind === item.value
                              ? "border-accent/30 bg-accent/12 text-accent"
                              : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white",
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <CodeEditorField
                    label="Команда"
                    shell={getCommandShellLabel(commandPlatform)}
                    value={commandScript}
                    placeholder={getCommandPlaceholder(commandPlatform)}
                    onChange={setCommandScript}
                  />

                  {commandKind === "template" ? (
                    <div className="rounded-[1.6rem] border border-white/8 bg-black/20 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white">Плейсхолдеры</div>
                          <p className="mt-1 text-sm leading-6 text-white/55">
                            Здесь задаётся, что именно будет подставляться вместо <span className="font-mono text-[#9af7c8]">$1</span>, <span className="font-mono text-[#9af7c8]">$2</span> и так далее. Это может быть как часть команды, так и вся команда целиком.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addPlaceholderRow}
                          className="rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent transition hover:bg-accent/15 sm:self-start"
                        >
                          + Плейсхолдер
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {placeholders.map((placeholder) => (
                          <EditablePlaceholderRow
                            key={placeholder.index}
                            placeholder={placeholder}
                            onChange={updatePlaceholderName}
                            onInsert={insertPlaceholderToken}
                            onDelete={removePlaceholderRow}
                          />
                        ))}

                        {!placeholders.length ? (
                          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
                            Плейсхолдеров пока нет.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <PrimaryButton onClick={saveCommand} disabled={saving || !draft.name.trim() || !commandScript.trim()} className="w-full sm:w-auto">
                      {saving ? "Сохранение..." : draft.id ? "Сохранить команду" : "Создать команду"}
                    </PrimaryButton>
                    {draft.id && !draft.isSystem ? (
                      <button
                        type="button"
                        onClick={deleteCommand}
                        className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-400/15 sm:w-auto"
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.75rem] border border-white/8 bg-black/20 p-4">
                    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="break-words text-lg font-semibold text-white">
                            {draft.name || "Новая команда"}
                          </div>
                          <div className="mt-1 text-sm text-accent">{getCommandPlatformLabel(commandPlatform)}</div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/60">
                        {draft.description || "Описание команды появится здесь."}
                      </p>
                      {commandKind === "template" && placeholders.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {normalizePlaceholders(placeholders).map((placeholder) => (
                            <span
                              key={placeholder.index}
                              className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/55"
                            >
                              ${placeholder.index} {placeholder.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-4 overflow-hidden rounded-[1.15rem] border border-white/8 bg-[#081018]">
                        <div className="flex items-center justify-between border-b border-white/8 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                          <span>terminal</span>
                          <span>{getCommandShellLabel(commandPlatform)}</span>
                        </div>
                        <div className="px-4 py-3 font-mono text-sm text-[#9af7c8]">
                          {commandScript || "Команда появится здесь."}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-white/8 bg-black/20 p-4">
                    <SectionTitle
                      title="Как это использовать"
                      subtitle="Пример шаблонной команды."
                    />
                    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-white/55">
                      Пример: команда <span className="font-mono text-[#9af7c8]">ssh $1 "systemctl restart $2"</span> и плейсхолдеры
                      <span className="font-mono text-white"> host</span> и <span className="font-mono text-white"> service</span>.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
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

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-white/60">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25"
      />
    </div>
  );
}

function CodeEditorField({
  label,
  shell,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  shell: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-white/60">{label}</label>
      <div className="overflow-hidden rounded-[1.25rem] border border-white/8 bg-[#081018]">
        <div className="flex flex-col gap-1 border-b border-white/8 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>terminal</span>
          <span>{shell}</span>
        </div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={6}
          placeholder={placeholder}
          className="min-h-[160px] w-full bg-transparent px-4 py-3 font-mono text-sm text-[#9af7c8] outline-none placeholder:text-white/20"
        />
      </div>
    </div>
  );
}

function EditablePlaceholderRow({
  placeholder,
  onChange,
  onInsert,
  onDelete,
}: {
  placeholder: CommandPlaceholderDto;
  onChange: (index: number, name: string) => void;
  onInsert: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">${placeholder.index}</div>
      <input
        value={placeholder.name}
        onChange={(event) => onChange(placeholder.index, event.target.value)}
        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-accent/25"
        placeholder="Например: host"
      />
      <button
        type="button"
        onClick={() => onInsert(placeholder.index)}
        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10 sm:self-auto"
      >
        Вставить
      </button>
      <button
        type="button"
        onClick={() => onDelete(placeholder.index)}
        className="inline-flex items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200 transition hover:bg-rose-400/15"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function getPlatformLabel(platform: ScenarioPlatform) {
  if (platform === "linux") return "Linux";
  if (platform === "windows") return "Windows";
  return "Все платформы";
}

function normalizePlaceholders(placeholders: CommandPlaceholderDto[]) {
  return placeholders
    .map((item) => ({
      index: Number(item.index),
      name: item.name.trim(),
    }))
    .filter((item) => Number.isInteger(item.index) && item.index > 0 && item.name.length > 0)
    .sort((left, right) => left.index - right.index)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.index === item.index) === index);
}

function getNextPlaceholderIndex(placeholders: CommandPlaceholderDto[]) {
  if (!placeholders.length) return 1;
  return Math.max(...placeholders.map((item) => Number(item.index) || 0)) + 1;
}

function inferCommandPlatform(bashScript?: string, powerShellScript?: string): CommandPlatform {
  const hasBash = Boolean(bashScript?.trim());
  const hasPowerShell = Boolean(powerShellScript?.trim());

  if (!hasBash && hasPowerShell) return "windows";
  return "linux";
}

function hasPlaceholderTokens(command: string) {
  return /\$\d+|\{\d+\}/.test(command);
}


function getSingleCommandValue(bashScript?: string, powerShellScript?: string) {
  return bashScript?.trim() || powerShellScript?.trim() || "";
}

function mapCommandByPlatform(platform: CommandPlatform, command: string) {
  if (platform === "linux") {
    return {
      bashScript: command,
      powerShellScript: command,
    };
  }

  return {
    bashScript: "",
    powerShellScript: command,
  };
}

function getCommandPlatformLabel(platform: CommandPlatform) {
  if (platform === "linux") return "Linux";
  return "Windows";
}

function parseCommandPlatform(value: string): CommandPlatform {
  if (value === "Linux") return "linux";
  return "windows";
}

function getCommandShellLabel(platform: CommandPlatform) {
  if (platform === "linux") return "Linux / bash";
  return "Windows / PowerShell";
}

function getCommandPlaceholder(platform: CommandPlatform) {
  if (platform === "linux") return "df -h";
  return "Get-PSDrive";
}
