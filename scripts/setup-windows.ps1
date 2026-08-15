param(
    [int]$Port = 8082,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE`: $Command $($Arguments -join ' ')"
    }
}

Write-Host "Checking Docker Desktop and Compose..."
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found. Install Docker Desktop, restart PowerShell, and enable Linux containers before running this script."
}
try {
    Invoke-Checked "docker" @("info")
} catch {
    throw "Docker Desktop is installed but its engine is not available. Start Docker Desktop, enable the WSL2 backend/Linux containers, wait until Docker is running, and rerun this script."
}
Invoke-Checked "docker" @("compose", "version")

if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from .env.example..."
    Copy-Item ".env.example" ".env"
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $password = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
    $envText = Get-Content ".env" -Raw
    $envText = $envText -replace "(?m)^MONGO_ROOT_PASSWORD=.*$", "MONGO_ROOT_PASSWORD=$password"
    Set-Content ".env" $envText
} else {
    Write-Host "Using existing .env; it will not be overwritten."
}

$env:ERYDEZ_PORT = "$Port"
Invoke-Checked "docker" @("compose", "config", "--quiet")
if (-not $SkipBuild) {
    Invoke-Checked "docker" @("compose", "build")
}
Invoke-Checked "docker" @("compose", "up", "-d")

$healthUrls = @(
    "http://127.0.0.1:$Port/healthz",
    "http://127.0.0.1:$Port/api/health/live",
    "http://127.0.0.1:$Port/api/health/ready"
)
$deadline = (Get-Date).AddMinutes(3)
do {
    $allHealthy = $true
    foreach ($url in $healthUrls) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ne 200) { $allHealthy = $false }
        } catch {
            $allHealthy = $false
        }
    }
    if (-not $allHealthy) { Start-Sleep -Seconds 3 }
} while (-not $allHealthy -and (Get-Date) -lt $deadline)

if (-not $allHealthy) {
    docker compose ps
    docker compose logs --tail=100 frontend backend mongodb
    throw "The Compose stack did not become healthy within three minutes."
}

Write-Host "E-RYDEZ Operations is ready at http://localhost:$Port"
docker compose ps
