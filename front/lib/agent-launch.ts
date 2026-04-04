const DEFAULT_AGENT_SERVER_URL = "http://localhost:5000";
const CLI_PYPI_INSTALL = "pipx install syseye-agent";
const WINDOWS_PIPX_INSTALL = "py -m pip install --user pipx && py -m pipx ensurepath";
const WINDOWS_PATH_REFRESH_NOTE = "After running ensurepath, open a new PowerShell window before using syseye-agent.";
const WINDOWS_SERVICE_ENABLE_COMMAND = "powershell -ExecutionPolicy Bypass -File .\\install-syseye-agent.ps1";
const LINUX_SERVICE_ENABLE_COMMAND = "systemctl --user daemon-reload && systemctl --user enable --now syseye-agent.service";

function escapePowerShellSingleQuoted(value: string) {
  return value.replaceAll("'", "''");
}

function escapePosixSingleQuoted(value: string) {
  return value.replaceAll("'", "'\"'\"'");
}

export function getDefaultAgentServerUrl() {
  return DEFAULT_AGENT_SERVER_URL;
}

export function getCliInstallCommand() {
  return CLI_PYPI_INSTALL;
}

export function getWindowsPipxInstallCommand() {
  return WINDOWS_PIPX_INSTALL;
}

export function getWindowsPathRefreshNote() {
  return WINDOWS_PATH_REFRESH_NOTE;
}

export function getWindowsServiceEnableCommand() {
  return WINDOWS_SERVICE_ENABLE_COMMAND;
}

export function getLinuxServiceEnableCommand() {
  return LINUX_SERVICE_ENABLE_COMMAND;
}

export function inferAgentServerUrl() {
  if (typeof window === "undefined") {
    return DEFAULT_AGENT_SERVER_URL;
  }

  const { hostname } = window.location;
  if (!hostname) {
    return DEFAULT_AGENT_SERVER_URL;
  }

  return `http://${hostname}:5000`;
}

export function buildLinuxServiceGenerateCommand(serverUrl: string, token: string) {
  return `syseye-agent service linux --server ${serverUrl} --token "${token}" > ~/.config/systemd/user/syseye-agent.service`;
}

export function buildWindowsInstallScriptContent(serverUrl: string, token: string) {
  const escapedServer = escapePowerShellSingleQuoted(serverUrl);
  const escapedToken = escapePowerShellSingleQuoted(token);

  return `$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$protocolLauncherPath = Join-Path $launcherDir "open-url.ps1"
$agentPath = Join-Path $env:USERPROFILE ".local\\bin\\syseye-agent.exe"

New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null

if (-not (Test-Path $agentPath)) {
  $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
  if ($command) {
    $agentPath = $command.Source
  } else {
    throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\\.local\\bin."
  }
}

$server = '${escapedServer}'
$token = '${escapedToken}'
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

if (-not (Test-Path $agentPath)) {
  $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
  if ($command) {
    $agentPath = $command.Source
  } else {
    throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\\.local\\bin."
  }
}

$parsed = [Uri]$Url
$commandName = if ($parsed.Host) { $parsed.Host } else { $parsed.AbsolutePath.Trim("/") }
if ($parsed.Scheme -ne "syseye-agent") {
  throw "Unsupported URL scheme: $($parsed.Scheme)"
}

if ($commandName -notin @("connect", "run")) {
  throw "Unsupported SysEye URL command: $commandName"
}

$query = @{}
foreach ($pair in $parsed.Query.TrimStart('?').Split('&', [System.StringSplitOptions]::RemoveEmptyEntries)) {
  $parts = $pair.Split('=', 2)
  $name = [Uri]::UnescapeDataString($parts[0].Replace('+', ' '))
  $value = if ($parts.Count -gt 1) { [Uri]::UnescapeDataString($parts[1].Replace('+', ' ')) } else { "" }
  $query[$name] = $value
}

$server = $query["server"]
$token = $query["token"]

if (-not $server) {
  throw "Missing server parameter."
}

if (-not $token) {
  throw "Missing token parameter."
}

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
Write-Host "SysEye Agent autostart installed to Startup folder, custom reconnect link registered, and agent started."`;
}

export function buildAgentReconnectUrl(serverUrl: string, token: string) {
  const params = new URLSearchParams({
    server: serverUrl,
    token,
  });

  return `syseye-agent://connect?${params.toString()}`;
}

export function buildReconnectCommand(serverUrl: string, token: string, os?: number | null) {
  if (os === 1) {
    return `nohup syseye-agent connect --server '${escapePosixSingleQuoted(serverUrl)}' --token '${escapePosixSingleQuoted(token)}' >/dev/null 2>&1 &`;
  }

  const escapedServer = escapePowerShellSingleQuoted(serverUrl);
  const escapedToken = escapePowerShellSingleQuoted(token);
  return `$agentPath = (Get-Command syseye-agent -ErrorAction Stop).Source
Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('connect', '--server', '${escapedServer}', '--token', '${escapedToken}')`;
}
