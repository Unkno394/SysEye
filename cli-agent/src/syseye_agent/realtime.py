from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable
from urllib.parse import urlencode

try:
    from signalrcore.hub_connection_builder import HubConnectionBuilder
    from signalrcore.helpers import Helpers, RequestHelpers
    from signalrcore.transport.long_polling.long_polling_client import LongPollingBaseClient
    from signalrcore.transport.long_polling.long_polling_transport import LongPollingTransport
    from signalrcore.transport.base_transport import TransportState
    from signalrcore.types import DEFAULT_ENCODING, HttpTransportType
except ImportError:  # pragma: no cover - handled at runtime on target machine
    HubConnectionBuilder = None
    Helpers = None
    LongPollingBaseClient = None
    LongPollingTransport = None
    RequestHelpers = None
    TransportState = None
    DEFAULT_ENCODING = "utf-8"
    HttpTransportType = None


def _patch_long_polling_client() -> None:
    if LongPollingBaseClient is None or RequestHelpers is None or getattr(LongPollingBaseClient, "_syseye_patched", False):
        return

    def send(self, message, headers=None):
        next_headers = {
            "Content-Type": "application/octet-stream",
        } if headers is None else dict(headers)
        next_headers.update(self.headers)

        msg_bytes = message if isinstance(message, bytes) else message.encode(DEFAULT_ENCODING)

        response = RequestHelpers.post(
            Helpers.websocket_to_http(self.url),
            headers=next_headers,
            proxies=self.proxies,
            params={
                "id": self.connection_id,
            },
            data=msg_bytes,
            ssl_context=self.ssl_context,
        )

        try:
            data = response.json()
        except ValueError:
            data = response.text.strip()

        self.logger.debug(
            f"Long Polling send response: {response.status_code} - {data}")

    def close(self):
        if not self._running:
            return

        self.logger.debug("Long polling closing connection")
        start = time.time()
        try:
            self._lock.acquire(timeout=10)

            self.is_closing = True
            self._running = False

            response = RequestHelpers.delete(
                Helpers.websocket_to_http(self.url),
                self.headers,
                self.proxies,
                {
                    "id": self.connection_id,
                },
                None,
                ssl_context=self.ssl_context)

            try:
                data = response.json()
            except ValueError:
                data = response.text.strip()

            if response.status_code not in [200, 202]:
                self.logger.error(
                    f"Error removing connection from the server {data}")

            self.dispose()
        except Exception as ex:
            self.logger.error(ex)
        finally:
            self._lock.release()
            self.is_closing = False
            self.on_close()

        self.logger.debug(
            f"Long polling closed connection {time.time() - start}")

    def recv_frame(self):
        data = None

        try:
            response = RequestHelpers.get(
                url=Helpers.websocket_to_http(self.url),
                headers={
                    **self._receive_headers,
                    **self.headers,
                },
                params={
                    "id": self.connection_id,
                },
                timeout=None,
                ssl_context=self.ssl_context,
            )

            status_code, data = response.status_code, response.content

            if status_code == 200 or status_code == 204:
                return data

            if status_code == 404 or status_code == 400:
                raise OSError(response.content.decode(DEFAULT_ENCODING))
        except TimeoutError:
            return None
        except Exception as err:
            if self.enable_trace:
                self.logger.debug(f"[TRACE] {err}")
        finally:
            if self.enable_trace:
                self.logger.debug(f"[TRACE] {data}")
        return data

    def run(self):
        def start_handshake():
            time.sleep(0.05)
            self.on_open()

        handshake_thread = threading.Thread(
            target=start_handshake,
            name=f"{self.thread_name} handshake",
            daemon=True,
        )
        handshake_thread.start()

        try:
            while self._running:
                frame = self._recv_frame()

                if frame is not None:
                    complete_buffer = self._append(frame)

                    if complete_buffer is not None:
                        message = self.prepare_data(complete_buffer)
                        self.on_message(self, message)

        except (OSError, Exception) as e:
            self._running = False

            if self.logger:
                self.logger.error(f"Receive error: {e}")

            if type(e) is OSError:  # pragma: no cover
                self.on_close()
            else:
                self.on_error(e)

    LongPollingBaseClient.send = send
    LongPollingBaseClient.close = close
    LongPollingBaseClient._recv_frame = recv_frame
    LongPollingBaseClient.run = run
    LongPollingBaseClient._syseye_patched = True

    if LongPollingTransport is not None and not getattr(LongPollingTransport, "_syseye_patched", False):
        def connection_check(self):
            if self._client.is_connection_closed():
                self.connection_checker.stop()
                self._set_state(TransportState.disconnected)
                return

            self.connection_alive = True
            self.connection_checker.last_message = time.time()

        LongPollingTransport.connection_check = connection_check
        LongPollingTransport._syseye_patched = True


_patch_long_polling_client()


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
        self._supports_server_heartbeat = True

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

    @property
    def supports_server_heartbeat(self) -> bool:
        with self._lock:
            return self._supports_server_heartbeat

    def send_heartbeat(self, payload: dict[str, Any] | None = None) -> None:
        if not self.supports_server_heartbeat:
            return

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
                "negotiateVersion": "0",
            }
        )

        connection = (
            HubConnectionBuilder()
            .with_url(
                f"{self.base_url}/agentHub?{query}",
                options={
                    "transport": HttpTransportType.long_polling,
                    "headers": {
                        "X-Api-Key": self.api_key,
                        "X-Agent-Id": self.agent_id,
                    },
                },
            )
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
        details = getattr(error, "error", None)
        invocation_id = getattr(error, "invocation_id", None)
        result = getattr(error, "result", None)

        parts = []
        if details:
            parts.append(str(details))
        if invocation_id:
            parts.append(f"invocationId={invocation_id}")
        if result is not None:
            parts.append(f"result={result!r}")

        rendered = ", ".join(parts) if parts else repr(error)
        normalized = rendered.lower()

        if "failed to invoke 'heartbeat'" in normalized and "method does not exist" in normalized:
            with self._lock:
                self._supports_server_heartbeat = False

            self.on_log("[WARN] realtime heartbeat method is missing on the server, continuing without hub heartbeat")
            return

        with self._lock:
            self._connected = False
            self._next_connect_at = time.time() + self.reconnect_delay

        self.on_log(f"[ERR] realtime error: {rendered}")

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
