param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$ExamplePortfolio = Join-Path $Backend "portfolio.example.json"
$Portfolio = Join-Path $Backend "portfolio.json"

if (-not (Test-Path $Portfolio) -and (Test-Path $ExamplePortfolio)) {
  Copy-Item $ExamplePortfolio $Portfolio
  Write-Host "Created backend\portfolio.json from portfolio.example.json"
}

Write-Host "Starting backend on http://localhost:$BackendPort"
$BackendProc = Start-Process `
  -FilePath "python" `
  -ArgumentList @("-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "$BackendPort", "--app-dir", $Backend) `
  -WorkingDirectory $Root `
  -PassThru

Write-Host "Starting frontend on http://localhost:$FrontendPort"
$FrontendProc = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$FrontendPort") `
  -WorkingDirectory $Frontend `
  -PassThru

Write-Host ""
Write-Host "Dashboard: http://localhost:$FrontendPort"
Write-Host "API:       http://localhost:$BackendPort"
Write-Host "Press Ctrl+C to stop both processes."

try {
  while ($true) {
    Start-Sleep -Seconds 1
    if ($BackendProc.HasExited -or $FrontendProc.HasExited) {
      throw "One of the dev servers exited."
    }
  }
}
finally {
  Stop-Process -Id $BackendProc.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $FrontendProc.Id -ErrorAction SilentlyContinue
}
