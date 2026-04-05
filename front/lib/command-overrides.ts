"use client";

import type { CommandDto } from "@/lib/backend-types";

type CommandOverride = Pick<CommandDto, "description" | "bashScript" | "powerShellScript" | "logRegex">;

const STORAGE_KEY = "syseye.command-overrides.v1";

function readOverrides(): Record<string, CommandOverride> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, CommandOverride> | null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Record<string, CommandOverride>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage failures and keep server data as the fallback.
  }
}

function hasText(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function saveCommandOverride(commandId: string, override: CommandOverride) {
  if (!commandId) {
    return;
  }

  const overrides = readOverrides();
  overrides[commandId] = {
    description: override.description ?? "",
    bashScript: override.bashScript ?? "",
    powerShellScript: override.powerShellScript ?? "",
    logRegex: override.logRegex ?? null,
  };
  writeOverrides(overrides);
}

export function deleteCommandOverride(commandId: string) {
  if (!commandId) {
    return;
  }

  const overrides = readOverrides();
  if (!(commandId in overrides)) {
    return;
  }

  delete overrides[commandId];
  writeOverrides(overrides);
}

export function mergeCommandOverrides(commands: CommandDto[]) {
  const overrides = readOverrides();

  return commands.map((command) => {
    const override = overrides[command.id];
    if (!override) {
      return command;
    }

    return {
      ...command,
      description: hasText(command.description) ? command.description : override.description,
      bashScript: hasText(command.bashScript) ? command.bashScript : override.bashScript,
      powerShellScript: hasText(command.powerShellScript) ? command.powerShellScript : override.powerShellScript,
      logRegex: hasText(command.logRegex) ? command.logRegex : override.logRegex,
    };
  });
}
