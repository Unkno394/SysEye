"use client";

import { getReadableApiError } from "@/lib/api-error";

let refreshPromise: Promise<boolean> | null = null;

function buildInit(init?: RequestInit): RequestInit {
  return {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  };
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch("/api/hackaton/auth/refresh", buildInit({ method: "POST" }));
      return response.ok;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function apiFetch(path: string, init?: RequestInit, retryOnUnauthorized = true) {
  const response = await fetch(path, buildInit(init));

  if (
    response.status === 401 &&
    retryOnUnauthorized &&
    path !== "/api/hackaton/auth/login" &&
    path !== "/api/hackaton/auth/register" &&
    path !== "/api/hackaton/auth/refresh"
  ) {
    const refreshed = await refreshSession();

    if (refreshed) {
      return fetch(path, buildInit(init));
    }
  }

  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit, fallback = "Не удалось выполнить запрос.") {
  const response = await apiFetch(path, init);

  if (!response.ok) {
    throw new Error(await getReadableApiError(response, fallback));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return JSON.parse(rawBody) as T;
  }

  return rawBody as T;
}
