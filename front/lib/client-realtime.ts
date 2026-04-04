"use client";

import { useEffect, useRef } from "react";
import { HubConnectionBuilder } from "@microsoft/signalr";
import type { AgentDto, AgentTaskDto } from "@/lib/backend-types";
import { getHackatonBackendUrl } from "@/lib/backend-url";

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
};

export function useClientRealtime(handlers: ClientRealtimeHandlers, enabled = true) {
  const handlersRef = useRef<ClientRealtimeHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return undefined;
    }

    const connection = new HubConnectionBuilder()
      .withUrl(getHackatonBackendUrl("/clientHub"), {
        withCredentials: true,
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000])
      .build();

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

    void connection.start().catch(() => undefined);

    return () => {
      connection.off("AgentUpdated");
      connection.off("AgentDeleted");
      connection.off("TaskQueued");
      connection.off("TaskUpdated");
      void connection.stop().catch(() => undefined);
    };
  }, [enabled]);
}
