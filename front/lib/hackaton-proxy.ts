import type { NextRequest } from "next/server";

const DEFAULT_HACKATON_API_BASE_URL = "http://localhost:5000";

export function normalizeBackendBaseUrl(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_HACKATON_API_BASE_URL;
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

export const HACKATON_API_BASE_URL = normalizeBackendBaseUrl(process.env.HACKATON_API_BASE_URL);

export function createBackendHeaders(headers: HeadersInit) {
  const nextHeaders = new Headers(headers);
  nextHeaders.delete("host");
  nextHeaders.delete("connection");
  nextHeaders.delete("content-length");
  nextHeaders.delete("origin");
  nextHeaders.delete("referer");
  return nextHeaders;
}

function rewriteSetCookie(cookie: string, request?: NextRequest) {
  if (!request) {
    return cookie;
  }

  const protocol = request.nextUrl.protocol.toLowerCase();
  if (protocol === "https:") {
    return cookie;
  }

  let rewritten = cookie.replace(/;\s*secure/gi, "");
  const hostname = request.nextUrl.hostname.toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    rewritten = rewritten.replace(/;\s*domain=[^;]+/gi, "");
  }

  return rewritten;
}

export async function createProxyResponse(backendResponse: Response, request?: NextRequest) {
  const responseHeaders = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  responseHeaders.set("cache-control", "no-store");

  const location = backendResponse.headers.get("location");
  if (location) responseHeaders.set("location", location);

  const allow = backendResponse.headers.get("allow");
  if (allow) responseHeaders.set("allow", allow);

  const setCookies = typeof backendResponse.headers.getSetCookie === "function"
    ? backendResponse.headers.getSetCookie()
    : backendResponse.headers.get("set-cookie")
      ? [backendResponse.headers.get("set-cookie") as string]
      : [];

  for (const cookie of setCookies) {
    responseHeaders.append("set-cookie", rewriteSetCookie(cookie, request));
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function fetchHackatonPath(
  backendPath: string,
  init?: RequestInit,
) {
  const targetUrl = new URL(backendPath, HACKATON_API_BASE_URL);
  return fetch(targetUrl, {
    redirect: "manual",
    ...init,
  });
}

export function resolveHackatonBackendPath(path: string[]) {
  const joinedPath = path.join("/");
  const rootSegment = path[0]?.toLowerCase();

  if (rootSegment === "apikey" || rootSegment === "heartbeat" || rootSegment === "clienthub") {
    return `/${joinedPath}`;
  }

  return `/api/${joinedPath}`;
}

export async function proxyToHackaton(request: NextRequest, path: string[]) {
  const targetUrl = new URL(resolveHackatonBackendPath(path), HACKATON_API_BASE_URL);
  targetUrl.search = request.nextUrl.search;

  const headers = createBackendHeaders(request.headers);

  const backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  return createProxyResponse(backendResponse, request);
}
