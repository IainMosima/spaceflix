# Spaceflix on Windows:  double-click "Start Spaceflix.cmd" / "Stop Spaceflix.cmd",
# or  powershell -ExecutionPolicy Bypass -File spaceflix.ps1 [start|stop|logs]
param([string]$Action = "start")
Set-Location $PSScriptRoot

# Keep the kit itself current: fetch the latest from GitHub, replace what
# changed, and start again with the new scripts. Offline? Carry on as is.
# ("Start Spaceflix.cmd" is left alone: Windows reads it while it runs.)
if ($Action -eq 'start' -and -not $env:SPACEFLIX_UPDATED) {
  try {
    $zip = Join-Path $env:TEMP 'spaceflix-kit.zip'
    $tmp = Join-Path $env:TEMP 'spaceflix-kit'
    Invoke-WebRequest 'https://github.com/IainMosima/movie-app/releases/download/kit/spaceflix.zip' `
      -OutFile $zip -UseBasicParsing -TimeoutSec 20
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive $zip $tmp -Force
    $changed = $false
    foreach ($f in Get-ChildItem $tmp -File) {
      if ($f.Name -eq 'Start Spaceflix.cmd') { continue }
      $dest = Join-Path $PSScriptRoot $f.Name
      if (-not (Test-Path $dest) -or (Get-FileHash $f.FullName).Hash -ne (Get-FileHash $dest).Hash) {
        Copy-Item $f.FullName $dest -Force
        Write-Host "Updated $($f.Name)"
        $changed = $true
      }
    }
    if ($changed) {
      $env:SPACEFLIX_UPDATED = '1'
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'spaceflix.ps1') start
      exit $LASTEXITCODE
    }
  } catch {
    Write-Host "Couldn't check for kit updates (offline?). Carrying on."
  }
}

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

# Every drive (C:, D:, USB...) inside the container at /drives/<letter>, so the
# app's Settings can switch to any folder on any drive while it runs.
$drives = Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |
  Where-Object { $_.Root -match '^[A-Za-z]:\\$' -and $null -ne $_.Free }
$lines = @('services:', '  spaceflix:', '    volumes:')
foreach ($d in $drives) {
  $lines += '      - type: bind'
  $lines += "        source: $($d.Name):/"
  $lines += "        target: /drives/$($d.Name.ToLower())"
}
Set-Content -Path 'docker-compose.drives.yml' -Value $lines -Encoding ascii
$compose = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.drives.yml')

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
  'stop' { docker @compose stop; Write-Host "Spaceflix stopped." }
  'logs' { docker @compose logs -f --tail 50 }
  default {
    Wait-Docker
    New-Item -ItemType Directory -Force -Path $data | Out-Null
    Write-Host "Getting the latest Spaceflix..."
    docker @compose pull
    if ($LASTEXITCODE -ne 0) { Write-Host "Couldn't check for updates (offline?). Using the version you have." }
    docker @compose up -d
    if ($LASTEXITCODE -ne 0) { exit 1 }
    docker image prune -f *> $null
    Write-Host ""
    Write-Host "Spaceflix is running:  http://localhost:8181"
    if ($ip) { Write-Host "Phone / TV:            http://${ip}:8181" }
    Write-Host "Movies are kept in:    $data"
    Start-Process "http://localhost:8181"
  }
}
