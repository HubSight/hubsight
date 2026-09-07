$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies for HubSight CCTV..." -ForegroundColor Cyan

# 1. Go Workspaces
Write-Host "`n[1/3] Downloading Go modules..." -ForegroundColor Yellow
$services = Get-ChildItem -Path "services" -Directory
foreach ($service in $services) {
    if (Test-Path "$($service.FullName)\go.mod") {
        Write-Host "Downloading Go modules for $($service.Name)..."
        Push-Location $service.FullName
        go mod download
        Pop-Location
    }
}

# 2. NodeJS (pnpm)
Write-Host "`n[2/3] Installing Node.js dependencies (pnpm)..." -ForegroundColor Yellow
$nodeApps = @("webapp", "services\relay")
foreach ($app in $nodeApps) {
    if (Test-Path $app) {
        Write-Host "Installing Node deps for $app..."
        Push-Location $app
        pnpm install
        Pop-Location
    }
}

# 3. Python (Vision Service)
Write-Host "`n[3/3] Installing Python dependencies (vision-service)..." -ForegroundColor Yellow
$visionDir = "services\vision"
if (Test-Path $visionDir) {
    Push-Location $visionDir
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating Python virtual environment..."
        python -m venv .venv
    }
    Write-Host "Installing pip requirements..."
    
    # Use python.exe directly from the venv
    $pythonExe = Join-Path -Path ".venv" -ChildPath "Scripts\python.exe"
    if (Test-Path $pythonExe) {
        & $pythonExe -m pip install -r requirements.txt
    } else {
        Write-Warning "Could not find python.exe in the virtual environment. Skipping pip install."
    }
    Pop-Location
}

Write-Host "`nAll dependencies installed successfully!" -ForegroundColor Green

