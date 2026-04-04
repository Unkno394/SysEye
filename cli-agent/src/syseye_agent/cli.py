from __future__ import annotations

import argparse

from syseye_agent import __version__
from syseye_agent.agent import Agent
from syseye_agent.config import AgentConfig
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

    windows_service_parser = service_subparsers.add_parser("windows", help="Print a PowerShell script for Windows Task Scheduler")
    add_service_arguments(windows_service_parser)

    subparsers.add_parser("version", help="Print CLI version")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "version":
        print(__version__)
        return 0

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
