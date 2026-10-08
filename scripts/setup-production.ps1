$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$cloud = Join-Path $repo 'cloud-api'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required and must be provided only to the server environment.' }
if ($env:VOXELPLUS_DATA_BACKEND -and $env:VOXELPLUS_DATA_BACKEND -notin @('postgres','neon')) { throw 'Production setup requires VOXELPLUS_DATA_BACKEND=postgres (or neon). MemoryStore and SQLite are not production backends.' }
$env:VOXELPLUS_DATA_BACKEND = 'postgres'
Push-Location $cloud
try {
  npm install
  npm run build
  node scripts/migrate-postgres.mjs
  Write-Output 'Production datastore setup completed. Credentials were not printed or written to the repository.'
} finally { Pop-Location }
