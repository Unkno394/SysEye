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
        self.pending_lock = threading.Lock()
        self.worker_started = False
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
        payload = {
            "agentId": self.agent_id,
            "name": self.hostname,
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
            reconnect_delay=max(2, self.config.poll_interval),
            on_log=self._log,
        )

    def _log(self, message: str) -> None:
        print(message, flush=True)

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

    def send_result(self, task_id: str, result: dict[str, str | int]) -> None:
        try:
            if self.realtime is not None and self.realtime.is_connected:
                self.realtime.complete_task(
                    task_id,
                    str(result.get("status", "error")),
                    str(result.get("stdout", "")),
                    str(result.get("stderr", "")),
                    int(result["exitCode"]) if result.get("exitCode") is not None else None,
                )
                return
        except RealtimeClientError as exc:
            print(f"[WARN] realtime result fallback: {exc}")

        try:
            self.api.send_result(
                {
                    "taskId": task_id,
                    **result,
                }
            )
        except ApiError as exc:
            print(f"[ERR] result: {exc}")

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

        with self.pending_lock:
            if task_id in self.pending_task_ids:
                return

            self.pending_task_ids.add(task_id)

        self.command_queue.put(payload)

        command_name = str(self._pick(payload, "commandName", "CommandName", "title", "Title") or task_id)
        self._log(f"[OK] task received: {command_name}")

    def _execute_payload(self, payload: dict[str, Any]) -> None:
        task_id = str(self._pick(payload, "executionId", "ExecutionId", "taskId", "TaskId") or "").strip()
        command = str(self._pick(payload, "script", "Script", "command", "Command") or "").strip()
        command_name = str(self._pick(payload, "commandName", "CommandName", "title", "Title") or task_id)

        if not task_id:
            self._log(f"[ERR] invalid task payload: {payload!r}")
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

        result = self.executor.execute(
            command,
            task_id,
            self.send_chunk,
            self.config.command_timeout,
        )

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

                self.command_queue.task_done()

    def _ensure_worker(self) -> None:
        if self.worker_started:
            return

        worker = threading.Thread(target=self._worker_loop, daemon=True)
        worker.start()
        self.worker_started = True

    def run(self) -> None:
        try:
            self.instance_lock.acquire()
        except SingleInstanceError as exc:
            self._log(f"[ERR] {exc}")
            return

        self._ensure_worker()
        self.register()

        try:
            while True:
                try:
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

                    if self.agent_id and (self.realtime is None or not self.realtime.is_connected):
                        task = self.api.get_task(self.agent_id)
                        if task is not None:
                            self._execute_payload(task)
                except ApiError as exc:
                    if exc.status_code == 404:
                        self.agent_id = self.token.agent_id
                        self.register()
                    else:
                        print(f"[ERR] loop: {exc}")
                except Exception as exc:  # pragma: no cover - runtime safety
                    print(f"[ERR] loop: {exc}")

                time.sleep(max(1, self.config.poll_interval))
        finally:
            self.instance_lock.release()
