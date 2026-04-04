from __future__ import annotations

import platform
import socket
import time
from pathlib import Path

from syseye_agent.api import ApiClient, ApiError
from syseye_agent.config import AgentConfig, ensure_app_dir, resolve_agent_token
from syseye_agent.executor import CommandExecutor


class Agent:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.token = resolve_agent_token(config.token)
        self.api = ApiClient(config.server_url, self.token.api_key, config.request_timeout)
        self.executor = CommandExecutor()
        self.state_path = Path(config.state_file).expanduser()
        self.agent_id = self._load_id() or self.token.agent_id
        self.hostname = socket.gethostname()
        self.os_name = platform.system().lower()
        self.distribution = self._detect_distribution()
        self.last_heartbeat = 0.0

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
            print(f"[OK] agent registered: {self.agent_id}")
        except ApiError as exc:
            print(f"[ERR] register: {exc}")

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
            self.api.heartbeat(self.agent_id, payload)
            self.last_heartbeat = time.time()
        except ApiError as exc:
            if exc.status_code == 404:
                self.agent_id = None
                self.register()
                return
            print(f"[ERR] heartbeat: {exc}")

    def send_chunk(self, task_id: str, chunk: str) -> None:
        try:
            self.api.send_output(
                {
                    "taskId": task_id,
                    "chunk": chunk,
                }
            )
        except ApiError as exc:
            print(f"[ERR] chunk: {exc}")

    def process_next_task(self) -> None:
        if not self.agent_id:
            return

        try:
            task = self.api.get_task(self.agent_id)
        except ApiError as exc:
            print(f"[ERR] task poll: {exc}")
            return

        if not task:
            return

        task_id = str(task.get("taskId", ""))
        task_type = task.get("taskType")
        raw_command = task.get("command")

        command = self.executor.build_command(task_type, self.os_name, raw_command)

        if not task_id:
            print("[ERR] task poll: missing taskId")
            return

        if not command:
            try:
                self.api.send_result(
                    {
                        "taskId": task_id,
                        "status": "error",
                        "stdout": "",
                        "stderr": f"unsupported task type: {task_type}",
                        "exitCode": -1,
                    }
                )
            except ApiError as exc:
                print(f"[ERR] unsupported task result: {exc}")
            return

        result = self.executor.execute(
            command,
            task_id,
            self.send_chunk,
            self.config.command_timeout,
        )

        try:
            self.api.send_result(
                {
                    "taskId": task_id,
                    **result,
                }
            )
        except ApiError as exc:
            print(f"[ERR] result: {exc}")

    def run(self) -> None:
        self.register()

        while True:
            self.heartbeat()
            self.process_next_task()
            time.sleep(self.config.poll_interval)
