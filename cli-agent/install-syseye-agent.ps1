$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$protocolLauncherPath = Join-Path $launcherDir "open-url.ps1"
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

$server = 'http://localhost:5000'
$token = 'eyJ2IjoxLCJhZ2VudElkIjoiZGZhMGJkMGEtMjdhMy00ZWM4LWIzM2QtMTQ2MDRjYmEwOTFiIiwiYXBpS2V5IjoibEZNNFVsN29idGRzS3pjSlVZN2xQaVN6c1Rsc2NIS2xXYngxejM4dVo0In0='
$launchUrl = "syseye-agent://connect?server=$([Uri]::EscapeDataString($server))&token=$([Uri]::EscapeDataString($token))"
$logFile = Join-Path $launcherDir "agent.log"
$startupScriptPath = Join-Path $startupDir "SysEye Agent.vbs"
$protocolRoot = "HKCU:\Software\Classes\syseye-agent"
$protocolCommandKey = Join-Path $protocolRoot "shell\open\command"
$runCommand = '"' + $agentPath + '" open-url "' + $launchUrl + '" --log-file "' + $logFile + '"'
$protocolScript = @'
param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$launcherDir = Join-Path $env:USERPROFILE ".syseye-agent"
$agentPath = Join-Path $env:USERPROFILE ".local\bin\syseye-agent.exe"
$logFile = Join-Path $launcherDir "agent.log"

New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null

if (-not (Test-Path $agentPath)) {
  $command = Get-Command syseye-agent -ErrorAction SilentlyContinue
  if ($command) {
    $agentPath = $command.Source
  } else {
    throw "syseye-agent not found. Run pipx ensurepath, reopen PowerShell, or use the executable from $HOME\.local\bin."
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
Write-Host "SysEye Agent autostart installed to Startup folder, custom reconnect link registered, and agent started."
