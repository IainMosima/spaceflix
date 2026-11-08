# Spaceflix on Windows:  double-click "Start Spaceflix.cmd" / "Stop Spaceflix.cmd",
# or  powershell -ExecutionPolicy Bypass -File spaceflix.ps1 [start|stop|logs]
param([string]$Action = "start")
Set-Location $PSScriptRoot

# Docker wants forward slashes; the app compares paths that way too.
$homeDir = $HOME -replace '\\', '/'
# D: drive if there is one, else Videos on C:, else Downloads.
$default = if (Test-Path 'D:\') { 'D:/Movies/Spaceflix' }
  elseif (Test-Path "$HOME\Videos") { "$homeDir/Videos/Spaceflix" }
  else { "$homeDir/Downloads/Spaceflix" }
$pointer = Join-Path $HOME '.spaceflix\data-dir'
$data = if ($env:DATA) { $env:DATA } elseif (Test-Path $pointer) { (Get-Content $pointer -Raw).Trim() } else { $default }
$data = $data -replace '\\', '/'
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.PrefixOrigin -eq 'Dhcp' } | Select-Object -First 1).IPAddress

$env:HOST_LAN_IP = $ip
$env:MEDIA_ROOT = $data
$env:HOST_DATA_DIR = $data
$env:HOST_HOME = $homeDir

function Wait-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Install Docker Desktop first: https://docs.docker.com/get-docker/"; exit 1
  }
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { return }
  Write-Host "Starting Docker..."
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 2
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return }
  }
  Write-Host "Docker didn't start. Open Docker Desktop and try again."; exit 1
}

switch ($Action) {
  'stop' { docker compose stop; Write-Host "Spaceflix stopped." }
  'logs' { docker compose logs -f --tail 50 }
  default {
    Wait-Docker
    New-Item -ItemType Directory -Force -Path $data | Out-Null
    Write-Host "Getting the latest Spaceflix..."
    docker compose pull
    if ($LASTEXITCODE -ne 0) { Write-Host "Couldn't check for updates (offline?). Using the version you have." }
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { exit 1 }
    docker image prune -f *> $null
    Write-Host ""
    Write-Host "Spaceflix is running:  http://localhost:8181"
    if ($ip) { Write-Host "Phone / TV:            http://${ip}:8181" }
    Write-Host "Movies are kept in:    $data"
    Start-Process "http://localhost:8181"
  }
}
