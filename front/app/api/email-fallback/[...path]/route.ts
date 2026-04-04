import type { NextRequest } from "next/server";

const EMAIL_FALLBACK_API_BASE_URL = process.env.EMAIL_FALLBACK_API_BASE_URL ?? "http://127.0.0.1:8000";

async function proxyToEmailFallback(request: NextRequest, path: string[]) {
  const targetUrl = new URL(`/${path.join("/")}`, EMAIL_FALLBACK_API_BASE_URL);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("origin");
  headers.delete("referer");

  const backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyToEmailFallback(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyToEmailFallback(request, path);
}
