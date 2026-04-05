"use client";

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:5000";

function normalizeBackendBaseUrl(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_BACKEND_BASE_URL;
  }

  try {
    const url = new URL(trimmed);
    if (url.pathname.endsWith("/swagger/index.html")) {
      url.pathname = "/";
      url.search = "";
      url.hash = "";
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/swagger\/index\.html$/i, "").replace(/\/$/, "");
  }
}

export function getHackatonBackendBaseUrl() {
  if (typeof window === "undefined") {
    return normalizeBackendBaseUrl(process.env.NEXT_PUBLIC_HACKATON_API_BASE_URL);
  }

  const fromEnv = normalizeBackendBaseUrl(process.env.NEXT_PUBLIC_HACKATON_API_BASE_URL);
  if (fromEnv && fromEnv !== DEFAULT_BACKEND_BASE_URL) {
    return fromEnv;
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "127.0.0.1";
  return `${protocol}//${hostname}:5000`;
}

export function getHackatonBackendUrl(path: string) {
  return new URL(path, `${getHackatonBackendBaseUrl()}/`).toString();
}
