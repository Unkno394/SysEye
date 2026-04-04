from __future__ import annotations

import os
import platform
import signal
import subprocess
import threading
from typing import Callable


class CommandExecutor:
    def __init__(self):
        self._lock = threading.RLock()
        self._processes: dict[str, subprocess.Popen[str]] = {}
        self._cancelled_task_ids: set[str] = set()
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

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            process = self._processes.get(task_id)
            if process is None:
                return False

            self._cancelled_task_ids.add(task_id)

        self._terminate_process(process)
        return True

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
                popen_kwargs = {
                    "args": command,
                    "shell": True,
                    "stdout": subprocess.PIPE,
                    "stderr": subprocess.PIPE,
                    "text": True,
                    "bufsize": 1,
                }
                popen_kwargs["start_new_session"] = True
                process = subprocess.Popen(**popen_kwargs)
        except Exception as exc:
            return {
                "status": "error",
                "stdout": "",
                "stderr": str(exc),
                "exitCode": -1,
            }

        with self._lock:
            self._processes[task_id] = process
            self._cancelled_task_ids.discard(task_id)

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
            self._terminate_process(process, force=True)
            stdout_thread.join(timeout=1)
            stderr_thread.join(timeout=1)
            self._clear_current_task(task_id)

            return {
                "status": "interrupted",
                "stdout": "\n".join(stdout_lines),
                "stderr": "command interrupted by timeout",
                "exitCode": -3,
            }

        stdout_thread.join(timeout=1)
        stderr_thread.join(timeout=1)

        was_cancelled = self._was_cancelled(task_id)
        self._clear_current_task(task_id)

        if was_cancelled:
            return {
                "status": "cancelled",
                "stdout": "\n".join(stdout_lines),
                "stderr": "command cancelled by user",
                "exitCode": -2,
            }

        if return_code < 0:
            return {
                "status": "interrupted",
                "stdout": "\n".join(stdout_lines),
                "stderr": "\n".join(stderr_lines) or f"command interrupted by signal {abs(return_code)}",
                "exitCode": return_code,
            }

        return {
            "status": "success" if return_code == 0 else "error",
            "stdout": "\n".join(stdout_lines),
            "stderr": "\n".join(stderr_lines),
            "exitCode": return_code,
        }

    def _was_cancelled(self, task_id: str) -> bool:
        with self._lock:
            return task_id in self._cancelled_task_ids

    def _clear_current_task(self, task_id: str) -> None:
        with self._lock:
            self._processes.pop(task_id, None)
            self._cancelled_task_ids.discard(task_id)

    @staticmethod
    def _terminate_process(process: subprocess.Popen[str], force: bool = False) -> None:
        if process.poll() is not None:
            return

        try:
            if os.name == "nt":
                if force:
                    process.kill()
                else:
                    process.terminate()
            else:
                sig = signal.SIGKILL if force else signal.SIGTERM
                os.killpg(os.getpgid(process.pid), sig)
        except Exception:
            try:
                if force:
                    process.kill()
                else:
                    process.terminate()
            except Exception:
                pass
