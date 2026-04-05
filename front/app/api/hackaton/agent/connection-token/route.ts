import type { NextRequest } from "next/server";
import {
  createBackendHeaders,
  createProxyResponse,
  fetchHackatonPath,
} from "@/lib/hackaton-proxy";

type AgentConnectionTokenDto = {
  agentId: string;
  name: string;
  token: string;
};

type ApiKeyDto = {
  value?: string;
};

type CreateAgentRequest = {
  name?: string;
};

async function issueFallbackConnectionToken(request: NextRequest, rawBody: string) {
  const headers = createBackendHeaders(request.headers);
  const createAgentResponse = await fetchHackatonPath("/api/agent", {
    method: "POST",
    headers,
    body: rawBody,
  });

  if (!createAgentResponse.ok) {
    return createProxyResponse(createAgentResponse, request);
  }

  const agentId = (await createAgentResponse.text()).trim().replace(/^"|"$/g, "");
  const parsedBody = (rawBody ? JSON.parse(rawBody) : {}) as CreateAgentRequest;
  const name = String(parsedBody.name ?? "").trim();

  const apiKeyResponse = await fetchHackatonPath(`/apikey/generate?AgentId=${encodeURIComponent(agentId)}&DaysToRevoke=30`, {
    method: "GET",
    headers,
  });

  if (!apiKeyResponse.ok) {
    return createProxyResponse(apiKeyResponse, request);
  }

  const apiKey = (await apiKeyResponse.json()) as ApiKeyDto;
  const payload = Buffer.from(JSON.stringify({
    agentId,
    apiKey: apiKey.value ?? "",
    name,
  }), "utf-8").toString("base64");

  const dto: AgentConnectionTokenDto = {
    agentId,
    name,
    token: payload,
  };

  return Response.json(dto, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers = createBackendHeaders(request.headers);

  const backendResponse = await fetchHackatonPath("/api/agent/connection-token", {
    method: "POST",
    headers,
    body: rawBody,
  });

  if (backendResponse.status !== 404 && backendResponse.status !== 405) {
    return createProxyResponse(backendResponse, request);
  }

  return issueFallbackConnectionToken(request, rawBody);
}
