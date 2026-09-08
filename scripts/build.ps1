param(
    [string]$Output = "dist",
    [string[]]$Services = @(
        "./services/auth",
        "./services/core",
        "./services/gateway",
        "./services/pool",
        "./services/push",
        "./services/recorder",
        "./services/bgrd",
        "./services/hawkeyes"
    )
)

$ErrorActionPreference = "Stop"

Write-Host "Building Go services into '$Output/'..." -ForegroundColor Cyan
if (-not (Test-Path $Output)) {
    New-Item -ItemType Directory -Force -Path $Output | Out-Null
}

go build -o "$Output/" $Services

Write-Host "Build completed successfully. Binaries saved to '$Output/'." -ForegroundColor Green
