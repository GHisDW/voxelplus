$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$cloud = Join-Path $repo 'cloud-api'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
Push-Location $cloud
try {
  npm install
  npm run build
  $env:VOXELPLUS_DATA_BACKEND = 'sqlite'
  $env:VOXELPLUS_SQLITE_PATH = Join-Path $cloud 'data\voxelplus.sqlite'
  node --input-type=module -e "const {getDataStore}=await import('./dist/store.js'); const db=getDataStore(); await db.table('voxel_accounts').select('id').limit(1); await db.close?.(); console.log('Local SQLite datastore initialized and verified.')"
} finally {
  Remove-Item Env:VOXELPLUS_DATA_BACKEND -ErrorAction SilentlyContinue
  Remove-Item Env:VOXELPLUS_SQLITE_PATH -ErrorAction SilentlyContinue
  Pop-Location
}
