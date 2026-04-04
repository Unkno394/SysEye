# SysEye CLI agent

Installable Python CLI for SysEye agents.

What it does now:
- creates the server-side agent record on first connect using a connection token
- can apply a custom machine name from the connection token
- sends heartbeat in the background loop
- polls and runs queued tasks
- can generate autostart service templates for Linux and Windows

Install from PyPI from any directory:

```bash
pipx install syseye-agent
```

On Windows, if this is your first `pipx` app, run `py -m pipx ensurepath` and reopen PowerShell before calling `syseye-agent`.

If `pipx` is not installed yet:

```bash
sudo pacman -S python-pipx
```

Alternative install from GitHub:

```bash
pipx install "git+https://github.com/Unkno394/SysEye.git#subdirectory=cli-agent"
```

Alternative via virtualenv:

```bash
git clone https://github.com/Unkno394/SysEye.git
cd SysEye/cli-agent
python -m venv .venv
source .venv/bin/activate
pip install setuptools wheel requests
pip install --no-build-isolation .
```

Run from any console:

```bash
syseye-agent connect --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN
```

Run directly from the repository checkout:

```bash
python cli-agent/main.py connect --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN
```

Run in the background and keep the agent alive after closing the terminal:

```bash
syseye-agent connect --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN --background
```

The same works from the repository checkout:

```bash
python cli-agent/main.py connect --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN --background
```

On Windows, a detached hidden process is the most compatible option. This does not depend on `--background` support in the installed CLI:

```powershell
$agentPath = (Get-Command syseye-agent).Source
Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('connect', '--server', 'http://localhost:5000', '--token', 'YOUR_CONNECTION_TOKEN')
```

Default background log file:

```text
~/.syseye-agent/agent.log
```

The connection token is issued in the site UI first. The agent card appears after the first successful connect.

Parallel execution can be limited explicitly:

```bash
syseye-agent connect --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN --max-parallel-tasks 3
```

Version check:

```bash
syseye-agent version
```

Linux autostart via systemd user service:

```bash
mkdir -p ~/.config/systemd/user
syseye-agent service linux --server http://localhost:5000 --token YOUR_CONNECTION_TOKEN > ~/.config/systemd/user/syseye-agent.service
systemctl --user daemon-reload
systemctl --user enable --now syseye-agent.service
```

Windows hidden background start:

Save this as `install-syseye-agent.ps1`:

```powershell
$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$agentPath = Join-Path $env:USERPROFILE ".local\bin\syseye-agent.exe"

New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null

if (-not (Test-Path $agentPath)) {
    $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
    if ($command) {
        $agentPath = $command.Source
    } else {
        throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\.local\bin."
    }
}

$server = "http://localhost:5000"
$token = "YOUR_CONNECTION_TOKEN"
$startupScriptPath = Join-Path $startupDir "SysEye Agent.vbs"
$runCommand = '"' + $agentPath + '" connect --server "' + $server + '" --token "' + $token + '"'
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run ""$runCommand"", 0, False
"@

Set-Content -Path $startupScriptPath -Value $vbsContent -Encoding ASCII
Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('connect', '--server', $server, '--token', $token)
Write-Host "SysEye Agent autostart installed to Startup folder and started."
```

Run it:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-syseye-agent.ps1
```

PyPI publication notes:
- package metadata lives in [`pyproject.toml`](./pyproject.toml)
- publishing guide lives in [`PUBLISHING.md`](./PUBLISHING.md)
