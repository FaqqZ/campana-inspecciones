# Respaldo de MongoDB y fotos en Windows (lo programa instalar-windows.ps1 todos los dias a las 02:30).
#   powershell -ExecutionPolicy Bypass -File deploy\backup-windows.ps1 [-AppDir C:\campana-inspecciones] [-Destino C:\campana-backups]
# Genera mongo-AAAA-MM-DD.gz y uploads-AAAA-MM-DD.zip y conserva 14 dias.
# Nota: este archivo es ASCII a proposito (PowerShell 5.1 lee mal los acentos sin BOM).
param(
  [string]$AppDir = 'C:\campana-inspecciones',
  [string]$Destino = 'C:\campana-backups',
  [string]$Base = 'campana-inspecciones'
)
$ErrorActionPreference = 'Stop'
$fecha = Get-Date -Format 'yyyy-MM-dd'
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

$dump = (Get-Command mongodump.exe -ErrorAction SilentlyContinue).Source
if (-not $dump) {
  $f = Get-ChildItem 'C:\Program Files\MongoDB\Tools' -Recurse -Filter mongodump.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($f) { $dump = $f.FullName }
}
if (-not $dump) { Write-Error 'No se encontro mongodump.exe (MongoDB Database Tools).'; exit 1 }

& $dump --db $Base "--archive=$Destino\mongo-$fecha.gz" --gzip
if ($LASTEXITCODE -ne 0) { Write-Error "mongodump fallo (codigo $LASTEXITCODE)"; exit 1 }

$fotos = Join-Path $AppDir 'server\uploads'
$zip = Join-Path $Destino "uploads-$fecha.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
if (Test-Path $fotos) { Compress-Archive -Path $fotos -DestinationPath $zip -Force }

# Conserva 14 dias
Get-ChildItem $Destino -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force
Write-Host "Respaldo listo en $Destino"
