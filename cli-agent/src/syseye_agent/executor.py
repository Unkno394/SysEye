from __future__ import annotations

import platform
import subprocess
import threading
from typing import Callable


class CommandExecutor:
    def __init__(self):
        self.allowed_commands = {
            "get_hostname": {
                "windows": "hostname",
                "linux": "hostname",
                "darwin": "hostname",
            },
            "check_internet": {
                "windows": "ping 8.8.8.8 -n 1",
                "linux": "ping -c 1 8.8.8.8",
                "darwin": "ping -c 1 8.8.8.8",
            },
            "check_disk": {
                "windows": "wmic logicaldisk get size,freespace,caption",
                "linux": "df -h",
                "darwin": "df -h",
            },
        }

    @staticmethod
    def _build_windows_popen_args() -> list[str]:
        return [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-OutputFormat",
            "Text",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "-",
        ]

    @staticmethod
    def _build_windows_script(command: str) -> str:
        return (
            '$ProgressPreference = "SilentlyContinue"\n'
            '$ErrorActionPreference = "Stop"\n'
            '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)\n'
            '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n'
            '$OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n'
            f"{command}\n"
        )

    def build_command(self, task_type: str | None, os_name: str, raw_command: str | None = None) -> str | None:
        if raw_command:
            return raw_command

        if not task_type or task_type not in self.allowed_commands:
            return None

        return self.allowed_commands[task_type].get(os_name)

    def execute(
        self,
        command: str,
        task_id: str,
        send_chunk: Callable[[str, str], None],
        timeout: int,
    ) -> dict[str, str | int]:
        stdout_lines: list[str] = []
        stderr_lines: list[str] = []
        is_windows = platform.system().lower() == "windows"

        try:
            if is_windows:
                process = subprocess.Popen(
                    self._build_windows_popen_args(),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                )
                if process.stdin is not None:
                    process.stdin.write(self._build_windows_script(command))
                    process.stdin.close()
            else:
                process = subprocess.Popen(
                    command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
        except Exception as exc:
            return {
                "status": "error",
                "stdout": "",
                "stderr": str(exc),
                "exitCode": -1,
            }

        def consume(stream, collector: list[str], prefix: str = "") -> None:
            if stream is None:
                return

            for raw_line in iter(stream.readline, ""):
                line = raw_line.rstrip()
                if not line:
                    continue
                collector.append(line)
                send_chunk(task_id, f"{prefix}{line}" if prefix else line)

            stream.close()

        stdout_thread = threading.Thread(target=consume, args=(process.stdout, stdout_lines), daemon=True)
        stderr_thread = threading.Thread(target=consume, args=(process.stderr, stderr_lines, "[stderr] "), daemon=True)

        stdout_thread.start()
        stderr_thread.start()

        try:
            return_code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout_thread.join(timeout=1)
            stderr_thread.join(timeout=1)

            return {
                "status": "error",
                "stdout": "\n".join(stdout_lines),
                "stderr": "command timed out",
                "exitCode": -1,
            }

        stdout_thread.join(timeout=1)
        stderr_thread.join(timeout=1)

        return {
            "status": "success" if return_code == 0 else "error",
            "stdout": "\n".join(stdout_lines),
            "stderr": "\n".join(stderr_lines),
            "exitCode": return_code,
        }
