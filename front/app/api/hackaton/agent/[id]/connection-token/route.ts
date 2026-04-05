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

type AgentDto = {
  name?: string;
};

type ApiKeyDto = {
  value?: string;
};

async function issueFallbackConnectionToken(request: NextRequest, id: string) {
  const headers = createBackendHeaders(request.headers);
  const agentResponse = await fetchHackatonPath(`/api/agent/${encodeURIComponent(id)}`, {
    method: "GET",
    headers,
  });

  if (!agentResponse.ok) {
    return createProxyResponse(agentResponse, request);
  }

  const agent = (await agentResponse.json()) as AgentDto;
  const name = String(agent.name ?? "").trim();

  const apiKeyResponse = await fetchHackatonPath(`/apikey/generate?AgentId=${encodeURIComponent(id)}&DaysToRevoke=30`, {
    method: "GET",
    headers,
  });

  if (!apiKeyResponse.ok) {
    return createProxyResponse(apiKeyResponse, request);
  }

  const apiKey = (await apiKeyResponse.json()) as ApiKeyDto;
  const payload = Buffer.from(JSON.stringify({
    agentId: id,
    apiKey: apiKey.value ?? "",
    name,
  }), "utf-8").toString("base64");

  const dto: AgentConnectionTokenDto = {
    agentId: id,
    name,
    token: payload,
  };

  return Response.json(dto, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const headers = createBackendHeaders(request.headers);

  const backendResponse = await fetchHackatonPath(`/api/agent/${encodeURIComponent(id)}/connection-token`, {
    method: "GET",
    headers,
  });

  if (backendResponse.status !== 404 && backendResponse.status !== 405) {
    return createProxyResponse(backendResponse, request);
  }

  return issueFallbackConnectionToken(request, id);
}
