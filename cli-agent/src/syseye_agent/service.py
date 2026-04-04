from __future__ import annotations

from textwrap import dedent


def build_linux_systemd_unit(server: str, token: str) -> str:
    return dedent(
        f"""\
        [Unit]
        Description=SysEye Agent
        Wants=network-online.target
        After=network-online.target

        [Service]
        Type=simple
        ExecStart=%h/.local/bin/syseye-agent connect --server {server} --token {token}
        Restart=always
        RestartSec=5
        Environment=PYTHONUNBUFFERED=1

        [Install]
        WantedBy=default.target
        """
    )


def build_windows_task_script(server: str, token: str) -> str:
    ps_command = f'syseye-agent connect --server {server} --token "{token}"'

    return dedent(
        f"""\
        $ErrorActionPreference = "Stop"
        $taskName = "SysEye Agent"
        $command = 'powershell.exe'
        $arguments = '-NoProfile -WindowStyle Hidden -Command "{ps_command}"'

        $action = New-ScheduledTaskAction -Execute $command -Argument $arguments
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew

        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "SysEye Agent autostart" -Force
        Start-ScheduledTask -TaskName $taskName
        Write-Host "SysEye Agent scheduled task installed and started."
        """
    )
