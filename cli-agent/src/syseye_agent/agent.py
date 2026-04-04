from __future__ import annotations

import os
import platform
import socket
import threading
import time
from queue import Queue
from pathlib import Path
from typing import Any

from syseye_agent.api import ApiClient, ApiError
from syseye_agent.config import AgentConfig, ensure_app_dir, resolve_agent_token
from syseye_agent.executor import CommandExecutor
from syseye_agent.realtime import AgentRealtimeClient, RealtimeClientError


class SingleInstanceError(RuntimeError):
    pass


class SingleInstanceLock:
    def __init__(self, path: Path):
        self.path = path
        self.handle = None

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open("a+b")

        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0, os.SEEK_END)
                if handle.tell() == 0:
                    handle.write(b"\0")
                    handle.flush()

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

            handle.seek(0)
            handle.truncate()
            handle.write(f"{os.getpid()}\n".encode("utf-8"))
            handle.flush()
        except OSError as exc:
            handle.close()
            raise SingleInstanceError("agent is already running for this user session") from exc

        self.handle = handle

    def release(self) -> None:
        if self.handle is None:
            return

        try:
            self.handle.seek(0)
            self.handle.truncate()

            if os.name == "nt":
                import msvcrt

                self.handle.write(b"\0")
                self.handle.flush()
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        finally:
            self.handle.close()
            self.handle = None


class Agent:
    _TRANSIENT_ERROR_MARKERS = (
        "temporary failure",
        "temporarily unavailable",
        "timed out",
        "timeout",
        "network is unreachable",
        "no route to host",
        "connection refused",
        "connection reset",
        "connection aborted",
        "could not resolve",
        "name or service not known",
        "try again",
        "tls handshake timeout",
        "i/o timeout",
        "service unavailable",
    )

    def __init__(self, config: AgentConfig):
        self.config = config
        self.token = resolve_agent_token(config.token)
        self.api = ApiClient(config.server_url, self.token.api_key, config.request_timeout)
        self.executor = CommandExecutor()
        self.state_path = Path(config.state_file).expanduser()
        self.instance_lock = SingleInstanceLock(Path(config.instance_lock_file).expanduser())
        self.agent_id = self._load_id() or self.token.agent_id
        self.hostname = socket.gethostname()
        self.os_name = platform.system().lower()
        self.distribution = self._detect_distribution()
        self.last_heartbeat = 0.0
        self.realtime: AgentRealtimeClient | None = None
        self.command_queue: Queue[dict[str, Any]] = Queue()
        self.pending_task_ids: set[str] = set()
        self.cancelled_task_ids: set[str] = set()
        self.pending_lock = threading.Lock()
        self.fetch_lock = threading.Lock()
        self.workers_started = False
        self.last_realtime_error = 0.0

    def _load_id(self) -> str | None:
        if self.state_path.exists():
            return self.state_path.read_text(encoding="utf-8").strip() or None
        return None

    def _save_id(self, value: str) -> None:
        ensure_app_dir()
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(value, encoding="utf-8")

    def _detect_ip_address(self) -> str | None:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
        except OSError:
            return None
        finally:
            probe.close()

    def _resolve_os_type(self) -> int:
        if self.os_name == "linux":
            return 1
        if self.os_name == "windows":
            return 2
        return 0

    def _detect_distribution(self) -> str | None:
        if self.os_name == "linux":
            os_release = Path("/etc/os-release")
            if os_release.exists():
                data: dict[str, str] = {}
                for raw_line in os_release.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = raw_line.strip()
                    if not line or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    data[key] = value.strip().strip('"').strip("'")

                return data.get("ID") or data.get("NAME") or "linux"

            return "linux"

        if self.os_name == "windows":
            return "windows"

        if self.os_name == "darwin":
            return "macos"

        return self.os_name or None

    def register(self) -> None:
        if self.token.agent_id:
            self.agent_id = self.token.agent_id

        resolved_name = self.token.name or self.hostname

        payload = {
            "agentId": self.agent_id,
            "name": resolved_name,
            "ipAddress": self._detect_ip_address(),
            "os": self._resolve_os_type(),
            "distribution": self.distribution,
        }

        try:
            agent = self.api.register(payload)
            resolved_id = agent.get("id")
            if resolved_id:
                self.agent_id = resolved_id
                self._save_id(resolved_id)
                self._rebuild_realtime_client()
            print(f"[OK] agent registered: {self.agent_id}")
        except ApiError as exc:
            print(f"[ERR] register: {exc}")
        except Exception as exc:  # pragma: no cover - runtime safety
            print(f"[ERR] register: {exc}")

    def _rebuild_realtime_client(self) -> None:
        if not self.agent_id:
            self.realtime = None
            return

        if self.realtime is not None:
            self.realtime.stop()

        self.realtime = AgentRealtimeClient(
            self.config.server_url,
            self.agent_id,
            self.token.api_key,
            self.enqueue_command,
            self.cancel_task,
            self.request_queue_fill,
            reconnect_delay=max(2, self.config.poll_interval),
            on_log=self._log,
        )

    def _log(self, message: str) -> None:
        print(message, flush=True)

    @classmethod
    def _is_transient_result(cls, result: dict[str, str | int]) -> bool:
        if str(result.get("status", "")).strip().lower() != "error":
            return False

        exit_code = result.get("exitCode")
        if isinstance(exit_code, int) and exit_code in {6, 7, 28, 52, 56, 110, 111, 10060, 10061}:
            return True

        text = " ".join(
            str(result.get(key, ""))
            for key in ("stderr", "stdout")
        ).lower()

        return any(marker in text for marker in cls._TRANSIENT_ERROR_MARKERS)

    def heartbeat(self) -> None:
        if not self.agent_id:
            self.register()
            return

        if time.time() - self.last_heartbeat < self.config.heartbeat_interval:
            return

        payload = {
            "ipAddress": self._detect_ip_address(),
            "distribution": self.distribution,
        }

        try:
            if self.realtime is not None and self.realtime.is_connected:
                self.realtime.send_heartbeat(payload)
            else:
                self.api.heartbeat(self.agent_id, payload)
            self.last_heartbeat = time.time()
        except ApiError as exc:
            if exc.status_code == 404:
                self.agent_id = None
                self.register()
                return
            if exc.status_code == 401:
                self.agent_id = None
                self.register()
                return

            print(f"[ERR] heartbeat: {exc}")
        except RealtimeClientError as exc:
            print(f"[ERR] heartbeat: {exc}")

    def send_chunk(self, task_id: str, chunk: str) -> None:
        try:
            if self.realtime is not None and self.realtime.is_connected:
                self.realtime.send_output(task_id, chunk)
                return
        except RealtimeClientError as exc:
            print(f"[WARN] realtime chunk fallback: {exc}")

        try:
            self.api.send_output(
                {
                    "taskId": task_id,
                    "chunk": chunk,
                }
            )
        except ApiError as exc:
            print(f"[ERR] chunk: {exc}")

    def send_result(self, task_id: str, result: dict[str, str | int]) -> bool:
        attempts = max(1, self.config.result_retry_attempts)

        for attempt in range(1, attempts + 1):
            try:
                if self.realtime is not None and self.realtime.is_connected:
                    self.realtime.complete_task(
                        task_id,
                        str(result.get("status", "error")),
                        str(result.get("stdout", "")),
                        str(result.get("stderr", "")),
                        int(result["exitCode"]) if result.get("exitCode") is not None else None,
                    )
                    return True
            except RealtimeClientError as exc:
                print(f"[WARN] realtime result fallback: {exc}")

            try:
                self.api.send_result(
                    {
                        "taskId": task_id,
                        **result,
                    }
                )
                return True
            except ApiError as exc:
                if attempt >= attempts:
                    print(f"[ERR] result: {exc}")
                    return False

                print(f"[WARN] result retry {attempt}/{attempts - 1}: {exc}")
                time.sleep(min(5, attempt))

        return False

    def _send_cancelled_result(self, task_id: str, reason: str) -> None:
        self.send_result(
            task_id,
            {
                "status": "cancelled",
                "stdout": "",
                "stderr": reason,
                "exitCode": -2,
            },
        )

    @staticmethod
    def _pick(payload: dict[str, Any], *names: str) -> Any:
        for name in names:
            if name in payload:
                return payload[name]
        return None

    def enqueue_command(self, payload: dict[str, Any]) -> None:
        task_id = str(self._pick(payload, "executionId", "ExecutionId", "taskId", "TaskId") or "").strip()
        if not task_id:
            self._log(f"[ERR] realtime command without executionId: {payload!r}")
            return

        cancelled_before_start = False

        with self.pending_lock:
            if task_id in self.cancelled_task_ids:
                cancelled_before_start = True
            elif task_id in self.pending_task_ids:
                return
            else:
                self.pending_task_ids.add(task_id)

        if cancelled_before_start:
            self._log(f"[SKIP] task already cancelled: {task_id}")
            self._send_cancelled_result(task_id, "command cancelled before start")
            with self.pending_lock:
                self.cancelled_task_ids.discard(task_id)
            return

        self.command_queue.put(payload)

        command_name = str(self._pick(payload, "commandName", "CommandName", "title", "Title") or task_id)
        self._log(f"[OK] task received: {command_name}")

    def cancel_task(self, task_id: str) -> None:
        with self.pending_lock:
            self.cancelled_task_ids.add(task_id)

        cancelled_running = self.executor.cancel(task_id)

        if cancelled_running:
            self._log(f"[STOP] task cancelled: {task_id}")
            return

        self._log(f"[STOP] cancel queued: {task_id}")

    def request_queue_fill(self) -> None:
        if not self.agent_id or self.fetch_lock.locked():
            return

        worker = threading.Thread(target=self._fill_capacity, daemon=True)
        worker.start()

    def _fill_capacity(self) -> None:
        if not self.agent_id:
            return

        if not self.fetch_lock.acquire(blocking=False):
            return

        try:
            while True:
                with self.pending_lock:
                    if len(self.pending_task_ids) >= max(1, self.config.max_parallel_tasks):
                        return

                task = self.api.get_task(self.agent_id)
                if task is None:
                    return

                self.enqueue_command(task)
        except ApiError as exc:
            if exc.status_code == 404:
                self.agent_id = self.token.agent_id
                self.register()
                return
            if exc.status_code == 401:
                self.agent_id = None
                self.register()
                return

            self._log(f"[ERR] fetch task: {exc}")
        finally:
            self.fetch_lock.release()

    def _execute_payload(self, payload: dict[str, Any]) -> None:
        task_id = str(self._pick(payload, "executionId", "ExecutionId", "taskId", "TaskId") or "").strip()
        command = str(self._pick(payload, "script", "Script", "command", "Command") or "").strip()
        command_name = str(self._pick(payload, "commandName", "CommandName", "title", "Title") or task_id)

        if not task_id:
            self._log(f"[ERR] invalid task payload: {payload!r}")
            return

        with self.pending_lock:
            cancelled_before_start = task_id in self.cancelled_task_ids

        if cancelled_before_start:
            self._log(f"[SKIP] cancelled before start: {task_id}")
            self._send_cancelled_result(task_id, "command cancelled before start")
            return

        if not command:
            self.send_result(
                task_id,
                {
                    "status": "error",
                    "stdout": "",
                    "stderr": "empty command payload",
                    "exitCode": -1,
                },
            )
            return

        self._log(f"[RUN] {command_name}: {command}")

        max_retries = max(0, self.config.transient_task_retries)
        attempt = 0

        while True:
            result = self.executor.execute(
                command,
                task_id,
                self.send_chunk,
                self.config.command_timeout,
            )

            if attempt >= max_retries or not self._is_transient_result(result):
                break

            attempt += 1
            delay = max(1, self.config.transient_task_retry_delay) * attempt
            self._log(
                f"[RETRY] {command_name}: temporary failure, retry {attempt}/{max_retries} in {delay}s",
            )
            time.sleep(delay)

        self.send_result(task_id, result)

    def _worker_loop(self) -> None:
        while True:
            payload = self.command_queue.get()
            task_id = str(self._pick(payload, "executionId", "ExecutionId", "taskId", "TaskId") or "").strip()

            try:
                self._execute_payload(payload)
            finally:
                if task_id:
                    with self.pending_lock:
                        self.pending_task_ids.discard(task_id)
                        self.cancelled_task_ids.discard(task_id)

                self.command_queue.task_done()
                self._fill_capacity()

    def _ensure_workers(self) -> None:
        if self.workers_started:
            return

        for _ in range(max(1, self.config.max_parallel_tasks)):
            worker = threading.Thread(target=self._worker_loop, daemon=True)
            worker.start()

        self.workers_started = True

    def run(self) -> None:
        try:
            self.instance_lock.acquire()
        except SingleInstanceError as exc:
            self._log(f"[ERR] {exc}")
            return

        self._ensure_workers()
        self.register()

        try:
            while True:
                try:
                    if not self.agent_id:
                        self.register()

                    self.heartbeat()

                    if self.agent_id and self.realtime is None:
                        self._rebuild_realtime_client()

                    if self.realtime is not None:
                        try:
                            self.realtime.ensure_connected()
                        except RealtimeClientError as exc:
                            now = time.time()
                            if now - self.last_realtime_error >= max(5, self.config.poll_interval):
                                self._log(f"[ERR] realtime connect: {exc}")
                                self.last_realtime_error = now

                    if self.agent_id:
                        self._fill_capacity()
                except ApiError as exc:
                    if exc.status_code in {401, 404}:
                        self.agent_id = self.token.agent_id
                        self.register()
                    else:
                        print(f"[ERR] loop: {exc}")
                except Exception as exc:  # pragma: no cover - runtime safety
                    print(f"[ERR] loop: {exc}")

                time.sleep(max(1, self.config.poll_interval))
        finally:
            self.instance_lock.release()
