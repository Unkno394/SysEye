from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable
from urllib.parse import urlencode

try:
    from signalrcore.hub_connection_builder import HubConnectionBuilder
except ImportError:  # pragma: no cover - handled at runtime on target machine
    HubConnectionBuilder = None


class RealtimeClientError(RuntimeError):
    pass


class AgentRealtimeClient:
    def __init__(
        self,
        server_url: str,
        agent_id: str,
        api_key: str,
        on_command: Callable[[dict[str, Any]], None],
        on_cancel: Callable[[str], None],
        on_queue_updated: Callable[[], None] | None = None,
        reconnect_delay: int = 5,
        on_log: Callable[[str], None] | None = None,
    ):
        self.base_url = server_url.rstrip("/")
        self.agent_id = agent_id
        self.api_key = api_key
        self.on_command = on_command
        self.on_cancel = on_cancel
        self.on_queue_updated = on_queue_updated or (lambda: None)
        self.reconnect_delay = max(1, reconnect_delay)
        self.on_log = on_log or (lambda message: None)

        self._connection = None
        self._connected = False
        self._lock = threading.RLock()
        self._next_connect_at = 0.0

    @property
    def is_connected(self) -> bool:
        with self._lock:
            return self._connected

    def ensure_connected(self) -> None:
        if HubConnectionBuilder is None:
            raise RealtimeClientError("signalrcore is not installed")

        if self.is_connected:
            return

        now = time.time()

        with self._lock:
            if self._connected:
                return

            if now < self._next_connect_at:
                return

            self._next_connect_at = now + self.reconnect_delay
            self._close_unlocked()
            self._connection = self._build_connection()

            try:
                self._connection.start()
            except Exception as exc:
                self._connection = None
                self._connected = False
                raise RealtimeClientError(f"signalr connect failed: {exc}") from exc

    def stop(self) -> None:
        with self._lock:
            self._close_unlocked()

    def send_heartbeat(self, payload: dict[str, Any] | None = None) -> None:
        self.send("Heartbeat", [payload or {}])

    def send_output(self, task_id: str, chunk: str) -> None:
        self.send("SendTaskOutput", [task_id, chunk])

    def complete_task(
        self,
        task_id: str,
        status: str,
        stdout: str,
        stderr: str,
        exit_code: int | None,
    ) -> None:
        self.send("CompleteTask", [task_id, status, stdout, stderr, exit_code])

    def send(self, method: str, arguments: list[Any]) -> None:
        with self._lock:
            connection = self._connection
            connected = self._connected

        if connection is None or not connected:
            raise RealtimeClientError("signalr is not connected")

        try:
            connection.send(method, arguments)
        except Exception as exc:
            with self._lock:
                self._connected = False
            raise RealtimeClientError(f"{method} failed: {exc}") from exc

    def _build_connection(self):
        query = urlencode(
            {
                "agentId": self.agent_id,
                "apiKey": self.api_key,
            }
        )

        connection = (
            HubConnectionBuilder()
            .with_url(f"{self.base_url}/agentHub?{query}")
            .configure_logging(logging.WARNING)
            .build()
        )

        connection.on_open(self._handle_open)
        connection.on_close(self._handle_close)
        connection.on_error(self._handle_error)
        connection.on("Command", self._handle_command)
        connection.on("CancelTask", self._handle_cancel)
        connection.on("QueueUpdated", self._handle_queue_updated)
        connection.on("Error", self._handle_server_error)

        return connection

    def _handle_open(self) -> None:
        with self._lock:
            self._connected = True

        self.on_log("[OK] realtime connected")

    def _handle_close(self, *_: Any) -> None:
        with self._lock:
            self._connected = False
            self._next_connect_at = time.time() + self.reconnect_delay

        self.on_log("[WARN] realtime disconnected")

    def _handle_error(self, error: Any) -> None:
        with self._lock:
            self._connected = False
            self._next_connect_at = time.time() + self.reconnect_delay

        self.on_log(f"[ERR] realtime error: {error}")

    def _handle_server_error(self, arguments: Any) -> None:
        message = self._unwrap_payload(arguments)
        self.on_log(f"[ERR] realtime server: {message}")

    def _handle_command(self, arguments: Any) -> None:
        payload = self._unwrap_payload(arguments)
        if not isinstance(payload, dict):
            self.on_log(f"[ERR] invalid command payload: {payload!r}")
            return

        self.on_command(payload)

    def _handle_cancel(self, arguments: Any) -> None:
        payload = self._unwrap_payload(arguments)
        task_id = str(payload or "").strip()
        if not task_id:
            self.on_log(f"[ERR] invalid cancel payload: {payload!r}")
            return

        self.on_cancel(task_id)

    def _handle_queue_updated(self, _: Any = None) -> None:
        self.on_queue_updated()

    @staticmethod
    def _unwrap_payload(arguments: Any) -> Any:
        if isinstance(arguments, (list, tuple)):
            if len(arguments) == 1:
                return arguments[0]
            return list(arguments)

        return arguments

    def _close_unlocked(self) -> None:
        connection = self._connection
        self._connection = None
        self._connected = False

        if connection is None:
            return

        try:
            connection.stop()
        except Exception:
            pass
