param(
    [string]$Username = "admin",
    [string]$Password = "",
    [switch]$NoForceChange
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " HubSight CCTV - Disaster Recovery Password Reset" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Check if Docker container is active
$dockerActive = $false
try {
    $containers = docker compose ps -q auth-service 2>$null
    if ($containers) {
        $dockerActive = $true
    }
} catch {
    $dockerActive = $false
}

$cmdArgs = @("reset-admin-password", "-u", $Username)
if ($Password) {
    $cmdArgs += @("-p", $Password)
}
if ($NoForceChange) {
    $cmdArgs += @("--force-change=false")
}

if ($dockerActive) {
    Write-Host "Executing password reset inside active 'auth-service' container..." -ForegroundColor Yellow
    docker compose exec -it auth-service /app/auth @cmdArgs
} else {
    Write-Host "Executing password reset via local Go runtime..." -ForegroundColor Yellow
    go run ./services/auth @cmdArgs
}
