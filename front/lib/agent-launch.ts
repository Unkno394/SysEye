const DEFAULT_AGENT_SERVER_URL = "http://localhost:5000";
const CLI_PYPI_INSTALL = "pipx install syseye-agent";
const WINDOWS_PIPX_INSTALL = "py -m pip install --user pipx && py -m pipx ensurepath";
const WINDOWS_PATH_REFRESH_NOTE = "After running ensurepath, open a new PowerShell window before using syseye-agent.";
const WINDOWS_SERVICE_ENABLE_COMMAND = "powershell -ExecutionPolicy Bypass -File .\\install-syseye-agent.ps1";
const LINUX_SERVICE_ENABLE_COMMAND = "systemctl --user daemon-reload && systemctl --user enable --now syseye-agent.service";

export type AgentLaunchPlatform = "linux" | "windows";

function escapePowerShellSingleQuoted(value: string) {
  return value.replaceAll("'", "''");
}

function escapePosixSingleQuoted(value: string) {
  return value.replaceAll("'", "'\"'\"'");
}

function normalizeServerUrl(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_SERVER_URL;
  }

  try {
    const url = new URL(trimmed);
    if (url.pathname.endsWith("/swagger/index.html")) {
      url.pathname = "/";
      url.search = "";
      url.hash = "";
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/swagger\/index\.html$/i, "").replace(/\/$/, "");
  }
}

export function getDefaultAgentServerUrl() {
  return normalizeServerUrl(process.env.NEXT_PUBLIC_AGENT_SERVER_URL);
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

export function inferLocalAgentPlatform(): AgentLaunchPlatform {
  if (typeof window === "undefined") {
    return "linux";
  }

  const fingerprint = `${window.navigator.userAgent} ${window.navigator.platform}`.toLowerCase();
  if (fingerprint.includes("win")) {
    return "windows";
  }

  return "linux";
}

export function getOsTypeForPlatform(platform: AgentLaunchPlatform): 1 | 2 {
  return platform === "windows" ? 2 : 1;
}

export function inferAgentServerUrl() {
  const fromEnv = normalizeServerUrl(process.env.NEXT_PUBLIC_AGENT_SERVER_URL);
  if (fromEnv && fromEnv !== DEFAULT_AGENT_SERVER_URL) {
    return fromEnv;
  }

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
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  return `syseye-agent service linux --server ${normalizedServerUrl} --token "${token}" > ~/.config/systemd/user/syseye-agent.service`;
}

export function buildWindowsInstallScriptContent(serverUrl: string, token: string) {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const escapedServer = escapePowerShellSingleQuoted(normalizedServerUrl);
  const escapedToken = escapePowerShellSingleQuoted(token);
  const escapedLaunchUrl = escapePowerShellSingleQuoted(buildAgentReconnectUrl(normalizedServerUrl, token));

  return `$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$protocolLauncherPath = Join-Path $launcherDir "open-url.ps1"
$agentPath = Join-Path $env:USERPROFILE ".local\\bin\\syseye-agent.exe"
$logFile = Join-Path $launcherDir "agent.log"

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
$launchUrl = '${escapedLaunchUrl}'
$startupScriptPath = Join-Path $startupDir "SysEye Agent.vbs"
$protocolRoot = "HKCU:\\Software\\Classes\\syseye-agent"
$protocolCommandKey = Join-Path $protocolRoot "shell\\open\\command"
$runCommand = '"' + $agentPath + '" open-url "' + $launchUrl + '" --log-file "' + $logFile + '"'
$protocolScript = @'
param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$agentPath = Join-Path $env:USERPROFILE ".local\\bin\\syseye-agent.exe"
$logFile = Join-Path $launcherDir "agent.log"

New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null

if (-not (Test-Path $agentPath)) {
  $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
  if ($command) {
    $agentPath = $command.Source
  } else {
    throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\\.local\\bin."
  }
}

Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('open-url', $Url, '--log-file', $logFile)
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
Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('open-url', $launchUrl, '--log-file', $logFile)
Write-Host "SysEye Agent autostart installed to Startup folder, custom reconnect link registered, and agent started."`;
}

export function buildAgentReconnectUrl(serverUrl: string, token: string) {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const params = new URLSearchParams({
    server: normalizedServerUrl,
    token,
  });

  return `syseye-agent://connect?${params.toString()}`;
}

export function buildReconnectCommand(serverUrl: string, token: string, os?: number | null) {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  if (os === 1) {
    return `syseye-agent connect --server '${escapePosixSingleQuoted(normalizedServerUrl)}' --token '${escapePosixSingleQuoted(token)}' --background`;
  }

  const escapedLaunchUrl = escapePowerShellSingleQuoted(buildAgentReconnectUrl(normalizedServerUrl, token));
  return `$agentPath = (Get-Command syseye-agent -ErrorAction Stop).Source
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$logFile = Join-Path $launcherDir "agent.log"
New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null
Start-Process -WindowStyle Hidden -FilePath $agentPath -ArgumentList @('open-url', '${escapedLaunchUrl}', '--log-file', $logFile)`;
}
