from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlparse

from syseye_agent import __version__
from syseye_agent.agent import Agent
from syseye_agent.config import AgentConfig, DEFAULT_INSTANCE_LOCK_FILE, DEFAULT_LOG_FILE, ensure_app_dir
from syseye_agent.service import build_linux_systemd_unit, build_windows_task_script


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="syseye-agent", description="SysEye CLI agent")
    subparsers = parser.add_subparsers(dest="command")

    def add_connect_arguments(command_parser: argparse.ArgumentParser) -> None:
        command_parser.add_argument("--server", required=True, help="Base URL of the SysEye backend")
        command_parser.add_argument("--token", required=True, help="Connection token from the site")
        command_parser.add_argument("--poll-interval", type=int, default=3)
        command_parser.add_argument("--heartbeat-interval", type=int, default=10)
        command_parser.add_argument("--request-timeout", type=int, default=15)
        command_parser.add_argument("--command-timeout", type=int, default=60)
        command_parser.add_argument("--background", action="store_true", help="Detach the agent and keep it running in the background")
        command_parser.add_argument("--log-file", default=None, help="Optional log file for background mode")
        command_parser.add_argument("--background-child", action="store_true", help=argparse.SUPPRESS)
        command_parser.add_argument("--transient-task-retries", type=int, default=1)
        command_parser.add_argument("--transient-task-retry-delay", type=int, default=2)
        command_parser.add_argument("--result-retry-attempts", type=int, default=3)
        command_parser.add_argument("--max-parallel-tasks", type=int, default=3)
        command_parser.add_argument("--state-file", default=None, help="Custom state file path")

    connect_parser = subparsers.add_parser("connect", help="Connect this machine and start the agent loop")
    add_connect_arguments(connect_parser)

    run_parser = subparsers.add_parser("run", help="Alias for connect")
    add_connect_arguments(run_parser)

    service_parser = subparsers.add_parser("service", help="Generate autostart service templates")
    service_subparsers = service_parser.add_subparsers(dest="service_target")

    def add_service_arguments(command_parser: argparse.ArgumentParser) -> None:
        command_parser.add_argument("--server", required=True, help="Base URL of the SysEye backend")
        command_parser.add_argument("--token", required=True, help="Connection token from the site")

    linux_service_parser = service_subparsers.add_parser("linux", help="Print a systemd user service unit")
    add_service_arguments(linux_service_parser)

    windows_service_parser = service_subparsers.add_parser("windows", help="Print a PowerShell script for Windows Startup autostart")
    add_service_arguments(windows_service_parser)

    open_url_parser = subparsers.add_parser("open-url", help="Launch the agent from a syseye-agent:// URL")
    open_url_parser.add_argument("url", help="Custom syseye-agent:// URL")
    open_url_parser.add_argument("--log-file", default=None, help="Optional log file for background mode")
    open_url_parser.add_argument("--state-file", default=None, help="Custom state file path")

    subparsers.add_parser("version", help="Print CLI version")

    return parser


def _resolve_log_path(raw_path: str | None) -> Path:
    if raw_path:
        return Path(raw_path).expanduser()

    ensure_app_dir()
    return DEFAULT_LOG_FILE


def _resolve_background_runner() -> list[str]:
    executable_name = Path(sys.executable).name.lower()
    argv0 = Path(sys.argv[0]).resolve()

    if executable_name.startswith("python") or executable_name == "py.exe":
        if argv0.suffix.lower() == ".py" and argv0.exists():
            return [sys.executable, str(argv0)]

        package_main = Path(__file__).resolve().parents[2] / "main.py"
        if package_main.exists():
            return [sys.executable, str(package_main)]

        return [sys.executable, "-m", "syseye_agent"]

    return [str(argv0)]


def _build_background_command(args: argparse.Namespace) -> list[str]:
    log_path = _resolve_log_path(args.log_file)
    command = [
        *_resolve_background_runner(),
        "connect",
        "--server",
        args.server,
        "--token",
        args.token,
        "--poll-interval",
        str(args.poll_interval),
        "--heartbeat-interval",
        str(args.heartbeat_interval),
        "--request-timeout",
        str(args.request_timeout),
        "--command-timeout",
        str(args.command_timeout),
        "--log-file",
        str(log_path),
        "--background-child",
    ]

    if args.state_file:
        command.extend(["--state-file", args.state_file])

    return command


def _activate_background_logging(raw_path: str | None) -> None:
    log_path = _resolve_log_path(raw_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_handle = log_path.open("a", encoding="utf-8", buffering=1)
    sys.stdout = log_handle
    sys.stderr = log_handle
    print(f"[child] background logging enabled: {log_path}", flush=True)


def _read_instance_pid(lock_path: Path) -> int | None:
    if not lock_path.exists():
        return None

    try:
        raw_value = lock_path.read_text(encoding="utf-8").strip()
    except OSError:
        return None

    if not raw_value:
        return None

    try:
        return int(raw_value)
    except ValueError:
        return None


def _is_running_pid(pid: int) -> bool:
    if pid <= 0:
        return False

    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _wait_for_process_exit(pid: int, timeout_seconds: float) -> bool:
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        if not _is_running_pid(pid):
            return True
        time.sleep(0.1)

    return not _is_running_pid(pid)


def _is_agent_process(pid: int) -> bool:
    if os.name == "nt":
        return True

    try:
        command_line = Path(f"/proc/{pid}/cmdline").read_text(encoding="utf-8", errors="ignore").replace("\0", " ")
    except OSError:
        return False

    normalized = command_line.lower()
    return "syseye_agent" in normalized or "syseye-agent" in normalized


def _terminate_existing_instance(lock_path: Path, log_handle) -> None:
    pid = _read_instance_pid(lock_path)
    if pid is None:
        return

    if not _is_running_pid(pid):
        try:
            lock_path.unlink(missing_ok=True)
        except OSError:
            pass
        return

    if not _is_agent_process(pid):
        log_handle.write(f"[launcher] lock file points to unrelated pid={pid}, leaving it untouched\n")
        log_handle.flush()
        try:
            lock_path.unlink(missing_ok=True)
        except OSError:
            pass
        return

    log_handle.write(f"[launcher] stopping existing agent instance pid={pid}\n")
    log_handle.flush()

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _wait_for_process_exit(pid, 5)
        return

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return

    if _wait_for_process_exit(pid, 5):
        return

    log_handle.write(f"[launcher] forcing agent instance pid={pid} to stop\n")
    log_handle.flush()

    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return

    _wait_for_process_exit(pid, 2)


def _try_update_linux_service(args: argparse.Namespace, log_handle) -> bool:
    if os.name == "nt":
        return False

    systemctl_path = shutil.which("systemctl")
    if not systemctl_path:
        return False

    unit_dir = Path.home() / ".config/systemd/user"
    unit_path = unit_dir / "syseye-agent.service"
    unit_content = build_linux_systemd_unit(args.server, args.token)

    try:
        unit_dir.mkdir(parents=True, exist_ok=True)
        unit_path.write_text(unit_content, encoding="utf-8")

        commands = [
            [systemctl_path, "--user", "daemon-reload"],
            [systemctl_path, "--user", "enable", "--now", "syseye-agent.service"],
            [systemctl_path, "--user", "restart", "syseye-agent.service"],
        ]

        for command in commands:
            completed = subprocess.run(
                command,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )

            if completed.returncode != 0:
                output = completed.stdout.strip()
                log_handle.write(
                    f"[launcher] systemd command failed: {' '.join(command)} :: {output}\n")
                log_handle.flush()
                return False

        log_handle.write(f"[launcher] updated user service {unit_path}\n")
        log_handle.flush()
        print(f"[OK] agent service updated: {unit_path}")
        return True
    except Exception as exc:
        log_handle.write(f"[launcher] systemd update failed: {exc}\n")
        log_handle.flush()
        return False


def _extract_single_query_value(values: dict[str, list[str]], name: str) -> str | None:
    items = values.get(name) or []
    for item in items:
        cleaned = item.strip()
        if cleaned:
            return cleaned
    return None


def _build_args_from_custom_url(raw_url: str, log_file: str | None = None, state_file: str | None = None) -> argparse.Namespace:
    parsed = urlparse(raw_url.strip())
    command = parsed.netloc or parsed.path.strip("/")

    if parsed.scheme != "syseye-agent":
        raise ValueError("unsupported URL scheme")

    if command not in {"connect", "run"}:
        raise ValueError("unsupported URL command")

    query = parse_qs(parsed.query, keep_blank_values=False)
    server = _extract_single_query_value(query, "server")
    token = _extract_single_query_value(query, "token")

    if not server:
        raise ValueError("missing server parameter")

    if not token:
        raise ValueError("missing token parameter")

    def parse_int(name: str, default: int) -> int:
        raw_value = _extract_single_query_value(query, name)
        if raw_value is None:
            return default
        return int(raw_value)

    return argparse.Namespace(
        command="connect",
        server=server,
        token=token,
        poll_interval=parse_int("pollInterval", 3),
        heartbeat_interval=parse_int("heartbeatInterval", 10),
        request_timeout=parse_int("requestTimeout", 15),
        command_timeout=parse_int("commandTimeout", 60),
        background=True,
        background_child=False,
        log_file=log_file,
        state_file=state_file,
    )


def _launch_background(args: argparse.Namespace) -> int:
    log_path = _resolve_log_path(args.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = DEFAULT_INSTANCE_LOCK_FILE

    with log_path.open("a", encoding="utf-8") as log_handle:
        log_handle.write("[launcher] starting detached SysEye agent\n")
        log_handle.flush()

        if _try_update_linux_service(args, log_handle):
            return 0

        _terminate_existing_instance(lock_path, log_handle)
        log_handle.flush()

    command = _build_background_command(args)
    popen_kwargs: dict[str, object] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }

    if os.name == "nt":
        creationflags = 0
        creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)
        creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        creationflags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
        popen_kwargs["creationflags"] = creationflags
    else:
        popen_kwargs["start_new_session"] = True

    process = subprocess.Popen(command, **popen_kwargs)

    print(f"[OK] agent started in background: pid={process.pid}")
    print(f"[LOG] {log_path}")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "version":
        print(__version__)
        return 0

    if args.command == "open-url":
        try:
            launch_args = _build_args_from_custom_url(args.url, args.log_file, args.state_file)
        except ValueError as exc:
            print(f"[ERR] {exc}")
            return 1
        except Exception as exc:
            print(f"[ERR] invalid URL: {exc}")
            return 1

        return _launch_background(launch_args)

    if args.command == "service":
        if args.service_target == "linux":
            print(build_linux_systemd_unit(args.server, args.token))
            return 0

        if args.service_target == "windows":
            print(build_windows_task_script(args.server, args.token))
            return 0

        service_parser = build_parser()
        service_parser.print_help()
        return 1

    if args.command not in {"connect", "run"}:
        parser.print_help()
        return 1

    if args.background and not args.background_child:
        return _launch_background(args)

    if args.background_child:
        _activate_background_logging(args.log_file)

    config = AgentConfig(
        server_url=args.server,
        token=args.token,
        poll_interval=args.poll_interval,
        heartbeat_interval=args.heartbeat_interval,
        request_timeout=args.request_timeout,
        command_timeout=args.command_timeout,
        transient_task_retries=args.transient_task_retries,
        transient_task_retry_delay=args.transient_task_retry_delay,
        result_retry_attempts=args.result_retry_attempts,
        max_parallel_tasks=args.max_parallel_tasks,
        **({"state_file": args.state_file} if args.state_file else {}),
    )

    agent = Agent(config)
    agent.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
