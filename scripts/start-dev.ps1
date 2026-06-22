param(
  [switch]$SkipGateway,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root '.venv\Scripts\python.exe'

if (-not (Test-Path $Python)) {
  $Python = 'python'
}

function Test-PortListening {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  return $null -ne $connection
}

function Start-DevProcess {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("`$env:PYTHONUTF8='1'; `$env:PYTHONIOENCODING='utf-8'; Set-Location '$WorkingDirectory'; $Command"))
  Start-Process powershell.exe -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', $encodedCommand
  ) -WindowStyle Normal | Out-Null
  Write-Host "started $Title" -ForegroundColor Green
}

if (-not $SkipGateway) {
  if (Test-PortListening 8108) {
    Write-Host 'gateway already listening on http://localhost:8108' -ForegroundColor Yellow
  } else {
    Start-DevProcess -Title 'gateway :8108' -WorkingDirectory (Join-Path $Root 'gateway') -Command "& '$Python' main.py"
  }
}

if (Test-PortListening 8000) {
  Write-Host 'backend already listening on http://localhost:8000' -ForegroundColor Yellow
} else {
  Start-DevProcess -Title 'backend :8000' -WorkingDirectory $Root -Command "& '$Python' src/api.py"
}

$vitePorts = @(5173, 5174, 5175, 5176)
$viteRunning = $false
foreach ($port in $vitePorts) {
  if (Test-PortListening $port) {
    Write-Host "frontend already listening on http://localhost:$port" -ForegroundColor Yellow
    $viteRunning = $true
    break
  }
}

if (-not $viteRunning) {
  Start-DevProcess -Title 'frontend Vite' -WorkingDirectory (Join-Path $Root 'frontend') -Command 'npm run dev -- --host 127.0.0.1'
}

if (-not $NoBrowser) {
  Start-Process 'http://localhost:5173' | Out-Null
}

Write-Host ''
Write-Host 'Demo services requested.' -ForegroundColor Cyan
Write-Host 'Gateway:  http://localhost:8108'
Write-Host 'Backend:  http://localhost:8000'
Write-Host 'Frontend: http://localhost:5173  (Vite may move to 5174+ if busy)'