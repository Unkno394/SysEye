"use client";

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:5000";

export function getHackatonBackendBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_HACKATON_API_BASE_URL ?? DEFAULT_BACKEND_BASE_URL;
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "127.0.0.1";
  return `${protocol}//${hostname}:5000`;
}

export function getHackatonBackendUrl(path: string) {
  return new URL(path, `${getHackatonBackendBaseUrl()}/`).toString();
}
