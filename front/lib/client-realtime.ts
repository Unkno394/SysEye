"use client";

import { useEffect, useRef } from "react";
import { HubConnection, HubConnectionBuilder, HubConnectionState, HttpTransportType } from "@microsoft/signalr";
import type { AgentDto, AgentTaskDto, ExecutionLogDto } from "@/lib/backend-types";

type AgentDeletedPayload = {
  agentId: string;
};

type TaskPayload = {
  agentId: string;
  task: AgentTaskDto;
};

type ClientRealtimeHandlers = {
  onAgentUpdated?: (agent: AgentDto) => void;
  onAgentDeleted?: (payload: AgentDeletedPayload) => void;
  onTaskQueued?: (payload: TaskPayload) => void;
  onTaskUpdated?: (payload: TaskPayload) => void;
  onExecutionLogReceived?: (payload: ExecutionLogDto) => void;
  executionIds?: string[];
};

export function useClientRealtime(handlers: ClientRealtimeHandlers, enabled = true) {
  const handlersRef = useRef<ClientRealtimeHandlers>(handlers);
  const connectionRef = useRef<HubConnection | null>(null);
  const subscribedExecutionIdsRef = useRef<Set<string>>(new Set());
  handlersRef.current = handlers;

  const syncExecutionSubscriptions = async () => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      return;
    }

    const desiredIds = new Set((handlersRef.current.executionIds ?? []).filter(Boolean));
    const currentIds = subscribedExecutionIdsRef.current;

    for (const executionId of currentIds) {
      if (desiredIds.has(executionId)) {
        continue;
      }

      try {
        await connection.invoke("UnsubscribeExecution", executionId);
      } catch {
        return;
      }

      currentIds.delete(executionId);
    }

    for (const executionId of desiredIds) {
      if (currentIds.has(executionId)) {
        continue;
      }

      try {
        await connection.invoke("SubscribeExecution", executionId);
      } catch {
        return;
      }

      currentIds.add(executionId);
    }
  };

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return undefined;
    }

    const connection = new HubConnectionBuilder()
      .withUrl("/api/hackaton/clientHub", {
        withCredentials: true,
        transport: HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
      .build();
    connectionRef.current = connection;

    connection.on("AgentUpdated", (agent: AgentDto) => {
      handlersRef.current.onAgentUpdated?.(agent);
    });

    connection.on("AgentDeleted", (payload: AgentDeletedPayload) => {
      handlersRef.current.onAgentDeleted?.(payload);
    });

    connection.on("TaskQueued", (payload: TaskPayload) => {
      handlersRef.current.onTaskQueued?.(payload);
    });

    connection.on("TaskUpdated", (payload: TaskPayload) => {
      handlersRef.current.onTaskUpdated?.(payload);
    });

    connection.on("ExecutionLogReceived", (payload: ExecutionLogDto) => {
      handlersRef.current.onExecutionLogReceived?.(payload);
    });

    void connection.start()
      .then(syncExecutionSubscriptions)
      .catch(() => undefined);

    return () => {
      subscribedExecutionIdsRef.current.clear();
      connectionRef.current = null;
      connection.off("AgentUpdated");
      connection.off("AgentDeleted");
      connection.off("TaskQueued");
      connection.off("TaskUpdated");
      connection.off("ExecutionLogReceived");
      void connection.stop().catch(() => undefined);
    };
  }, [enabled]);

  useEffect(() => {
    void syncExecutionSubscriptions();
  }, [enabled, handlers.executionIds]);
}
