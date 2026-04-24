# Repo-local Postgres 18 cluster (port 55432, trust auth on localhost only).
# Requires PostgreSQL 18 binaries in default install path.
param(
  [Parameter(Position = 0)]
  [ValidateSet("init", "start", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DataDir = Join-Path $RepoRoot ".beatbattle-pgdata"
$Bin = "C:\Program Files\PostgreSQL\18\bin"
$PgCtl = Join-Path $Bin "pg_ctl.exe"
$InitDb = Join-Path $Bin "initdb.exe"
$Createdb = Join-Path $Bin "createdb.exe"
$Log = Join-Path $DataDir "server.log"

if (-not (Test-Path $PgCtl)) {
  Write-Error "PostgreSQL 18 not found at $Bin. Install from postgresql.org or adjust the path in this script."
}

if ($Action -eq "init") {
  if (Test-Path $DataDir) {
    Write-Error "Already exists: $DataDir`nDelete it first if you want a fresh cluster."
  }
  & $InitDb -D $DataDir -U beatbattle -E UTF8 --locale=C -A trust
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $PgCtl -D $DataDir -l $Log -o "-p 55432" start
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $env:PGHOST = "127.0.0.1"
  $env:PGPORT = "55432"
  $env:PGUSER = "beatbattle"
  & $Createdb -w beatbattle
  $code = $LASTEXITCODE
  & $PgCtl -D $DataDir stop
  if ($code -ne 0) { exit $code }
  Write-Host "Init done. Start any time with: pnpm db:local:start"
  exit 0
}

if ($Action -eq "start") {
  if (-not (Test-Path $DataDir)) {
    Write-Error "Data directory missing: $DataDir`nRun once: pnpm exec powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/beatbattle-pg.ps1 init"
  }
  & $PgCtl -D $DataDir -l $Log -o "-p 55432" start
  exit $LASTEXITCODE
}

if ($Action -eq "stop") {
  & $PgCtl -D $DataDir stop
  exit $LASTEXITCODE
}

& $PgCtl -D $DataDir status
exit $LASTEXITCODE
