from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import parse_qs, urlparse

from syseye_agent import __version__
from syseye_agent.agent import Agent
from syseye_agent.config import AgentConfig, DEFAULT_LOG_FILE, ensure_app_dir
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

    command = _build_background_command(args)
    with log_path.open("a", encoding="utf-8") as log_handle:
        log_handle.write("[launcher] starting detached SysEye agent\n")
        log_handle.flush()

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
        **({"state_file": args.state_file} if args.state_file else {}),
    )

    agent = Agent(config)
    agent.run()
    return 0
