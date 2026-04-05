"use client";

import { apiJson } from "@/lib/api-client";
import type { CommandDto, PagedResult } from "@/lib/backend-types";
import { mergeCommandOverrides } from "@/lib/command-overrides";

const COMMANDS_PAGE_SIZE = 100;

export async function loadAllCommands(fallback = "Не удалось загрузить команды.") {
  const firstPage = await apiJson<PagedResult<CommandDto>>(
    `/api/hackaton/command?take=${COMMANDS_PAGE_SIZE}&skip=0`,
    { method: "GET" },
    fallback,
  );

  const items = firstPage.items ?? [];
  const totalCount = firstPage.totalCount ?? items.length;

  if (totalCount <= items.length) {
    return mergeCommandOverrides(items);
  }

  const pages: Promise<PagedResult<CommandDto>>[] = [];

  for (let skip = items.length; skip < totalCount; skip += COMMANDS_PAGE_SIZE) {
    pages.push(
      apiJson<PagedResult<CommandDto>>(
        `/api/hackaton/command?take=${COMMANDS_PAGE_SIZE}&skip=${skip}`,
        { method: "GET" },
        fallback,
      ),
    );
  }

  const restPages = await Promise.all(pages);
  return mergeCommandOverrides([items, ...restPages.map((page) => page.items ?? [])].flat());
}
