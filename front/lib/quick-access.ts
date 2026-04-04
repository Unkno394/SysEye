export type QuickAccessSettings = {
  commandIds: string[];
  scenarioIds: string[];
};

const QUICK_ACCESS_STORAGE_KEY = "syseye.quick-access";

export function getQuickAccessSettings(): QuickAccessSettings {
  if (typeof window === "undefined") {
    return { commandIds: [], scenarioIds: [] };
  }

  try {
    const raw = window.localStorage.getItem(QUICK_ACCESS_STORAGE_KEY);
    if (!raw) return { commandIds: [], scenarioIds: [] };

    const parsed = JSON.parse(raw) as Partial<QuickAccessSettings>;
    return {
      commandIds: Array.isArray(parsed.commandIds) ? parsed.commandIds.filter((value): value is string => typeof value === "string") : [],
      scenarioIds: Array.isArray(parsed.scenarioIds) ? parsed.scenarioIds.filter((value): value is string => typeof value === "string") : [],
    };
  } catch {
    return { commandIds: [], scenarioIds: [] };
  }
}

export function saveQuickAccessSettings(settings: QuickAccessSettings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    QUICK_ACCESS_STORAGE_KEY,
    JSON.stringify({
      commandIds: settings.commandIds,
      scenarioIds: settings.scenarioIds,
    }),
  );
}
