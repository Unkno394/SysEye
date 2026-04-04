from __future__ import annotations

import shlex
import sys
from textwrap import dedent


def build_linux_systemd_unit(server: str, token: str) -> str:
    python = shlex.quote(sys.executable)
    module = "syseye_agent"
    server_arg = shlex.quote(server)
    token_arg = shlex.quote(token)

    return dedent(
        f"""\
        [Unit]
        Description=SysEye Agent
        Wants=network-online.target
        After=network-online.target

        [Service]
        Type=simple
        ExecStart={python} -m {module} connect --server {server_arg} --token {token_arg}
        Restart=always
        RestartSec=5
        Environment=PYTHONUNBUFFERED=1
        Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
        WorkingDirectory=%h

        [Install]
        WantedBy=default.target
        """
    )


def build_windows_task_script(server: str, token: str) -> str:
    escaped_server = server.replace("'", "''")
    escaped_token = token.replace("'", "''")

    return dedent(
        f"""\
        $ErrorActionPreference = "Stop"
        $startupDir = [Environment]::GetFolderPath("Startup")
        $launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
        $protocolLauncherPath = Join-Path $launcherDir "open-url.ps1"
        $agentPath = Join-Path $env:USERPROFILE ".local\\bin\\syseye-agent.exe"

        New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null

        if (-not (Test-Path $agentPath)) {{
            $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
            if ($command) {{
                $agentPath = $command.Source
            }} else {{
                throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\\.local\\bin."
            }}
        }}

        $server = '{escaped_server}'
        $token = '{escaped_token}'
        $startupScriptPath = Join-Path $startupDir "SysEye Agent.vbs"
        $protocolRoot = "HKCU:\\Software\\Classes\\syseye-agent"
        $protocolCommandKey = Join-Path $protocolRoot "shell\\open\\command"
        $runCommand = '"' + $agentPath + '" connect --server "' + $server + '" --token "' + $token + '"'
        $protocolScript = @'
        param(
          [Parameter(Mandatory = $true)]
          [string]$Url
        )

        $ErrorActionPreference = "Stop"
        $launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
        $agentPath = Join-Path $env:USERPROFILE ".local\\bin\\syseye-agent.exe"

        if (-not (Test-Path $agentPath)) {{
          $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
          if ($command) {{
            $agentPath = $command.Source
          }} else {{
            throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\\.local\\bin."
          }}
        }}

        $parsed = [Uri]$Url
        $commandName = if ($parsed.Host) {{ $parsed.Host }} else {{ $parsed.AbsolutePath.Trim("/") }}
        if ($parsed.Scheme -ne "syseye-agent") {{
          throw "Unsupported URL scheme: $($parsed.Scheme)"
        }}

        if ($commandName -notin @("connect", "run")) {{
          throw "Unsupported SysEye URL command: $commandName"
        }}

        $query = @{{}}
        foreach ($pair in $parsed.Query.TrimStart('?').Split('&', [System.StringSplitOptions]::RemoveEmptyEntries)) {{
          $parts = $pair.Split('=', 2)
          $name = [Uri]::UnescapeDataString($parts[0].Replace('+', ' '))
          $value = if ($parts.Count -gt 1) {{ [Uri]::UnescapeDataString($parts[1].Replace('+', ' ')) }} else {{ "" }}
          $query[$name] = $value
        }}

        $server = $query["server"]
        $token = $query["token"]

        if (-not $server) {{
          throw "Missing server parameter."
        }}

        if (-not $token) {{
          throw "Missing token parameter."
        }}

        Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('connect', '--server', $server, '--token', $token)
        '@
        $protocolCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $protocolLauncherPath + '" "%1"'
        $vbsContent = @"
        Set WshShell = CreateObject("WScript.Shell")
        WshShell.Run ""$runCommand"", 0, False
        "@

        Set-Content -Path $startupScriptPath -Value $vbsContent -Encoding ASCII
        Set-Content -Path $protocolLauncherPath -Value $protocolScript -Encoding UTF8
        New-Item -Path $protocolRoot -Force | Out-Null
        Set-Item -Path $protocolRoot -Value "URL:SysEye Agent Protocol"
        New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
        New-Item -Path $protocolCommandKey -Force | Out-Null
        Set-Item -Path $protocolCommandKey -Value $protocolCommand
        Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('connect', '--server', $server, '--token', $token)
        Write-Host "SysEye Agent autostart installed to Startup folder, custom reconnect link registered, and agent started."
        """
    )
