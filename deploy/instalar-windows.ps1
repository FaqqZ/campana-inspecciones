# Instalacion (y actualizacion) en Windows Server: Node + MongoDB + tarea de inicio automatico + firewall + respaldo diario.
# Ejecutar en PowerShell COMO ADMINISTRADOR, desde una copia del repositorio:
#   powershell -ExecutionPolicy Bypass -File deploy\instalar-windows.ps1
#
# Parametros opcionales:
#   -Port 5003                      puerto en el que escucha la aplicacion
#   -AppDir C:\campana-inspecciones carpeta de instalacion
#   -GeoUserAgent "..."             contacto real para Nominatim (solo si se ubican direcciones nuevas)
#   -Https                          hay un proxy con HTTPS delante: activa HSTS y TRUST_PROXY
#   -MongoUri "mongodb://..."       usar un MongoDB existente en vez de instalar uno local
#   -Datos C:\ruta\campana-datos-AAAA-MM-DD-HHMM.tar.gz   cargar un paquete de exportar-datos.sh (REEMPLAZA la base local)
# Se puede volver a ejecutar para actualizar: no pisa el .env ni los datos.
# Nota: este archivo es ASCII a proposito (PowerShell 5.1 lee mal los acentos sin BOM).
param(
  [int]$Port = 5003,
  [string]$AppDir = 'C:\campana-inspecciones',
  [string]$GeoUserAgent = '',
  [switch]$Https,
  [string]$MongoUri = '',
  [string]$Datos = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Tarea = 'CampanaInspecciones'
$TareaBackup = 'CampanaInspeccionesBackup'
$Base = 'campana-inspecciones'
$DestinoBackup = 'C:\campana-backups'

function Paso($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Fallo($t) { Write-Host "ERROR: $t" -ForegroundColor Red; exit 1 }
function Comprobar($t) { if ($LASTEXITCODE -ne 0) { Fallo "$t (codigo $LASTEXITCODE)" } }
function ActualizarPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function BuscarExe($nombre, $carpetas) {
  $c = Get-Command $nombre -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($d in $carpetas) {
    if (Test-Path $d) {
      $f = Get-ChildItem $d -Recurse -Filter $nombre -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($f) { return $f.FullName }
    }
  }
  return $null
}
function Descargar($url, $destino) {
  Write-Host "Descargando $url"
  Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing
}

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { Fallo 'Ejecutalo como Administrador (clic derecho en PowerShell > Ejecutar como administrador).' }
$tmp = Join-Path $env:TEMP 'campana-instalacion'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# ---------------------------------------------------------------- Node.js
Paso 'Node.js 20 o superior'
ActualizarPath
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
  $mayor = [int](& node -p 'process.versions.node.split(".")[0]')
  if ($mayor -ge 20) { $nodeOk = $true; Write-Host "Node $(& node -v) ya instalado." }
}
if (-not $nodeOk) {
  $idx = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
  $ver = ($idx | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1).version
  if (-not $ver) { Fallo 'No se pudo determinar la version de Node 22. Instalalo a mano desde nodejs.org y volve a ejecutar.' }
  $msi = Join-Path $tmp "node-$ver-x64.msi"
  Descargar "https://nodejs.org/dist/$ver/node-$ver-x64.msi" $msi
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fallo "Fallo la instalacion de Node (codigo $($p.ExitCode))" }
  ActualizarPath
  Write-Host "Node $(& node -v) instalado."
}
$Node = (Get-Command node).Source
$Npm = (Get-Command npm.cmd).Source

# ---------------------------------------------------------------- MongoDB
$MongoLocal = $false
if ([string]::IsNullOrWhiteSpace($MongoUri)) {
  Paso 'MongoDB 8.0 (local)'
  $MongoLocal = $true
  if (-not (Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue)) {
    $msi = Join-Path $tmp 'mongodb-8.0.4.msi'
    Descargar 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4-signed.msi' $msi
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart ADDLOCAL=ServerService" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fallo "Fallo la instalacion de MongoDB (codigo $($p.ExitCode)). Instalalo a mano y volve a ejecutar, o usa -MongoUri." }
  }
  Set-Service -Name 'MongoDB' -StartupType Automatic
  if ((Get-Service 'MongoDB').Status -ne 'Running') { Start-Service 'MongoDB' }
  $listo = $false
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue) { $listo = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $listo) { Fallo 'MongoDB no responde en 127.0.0.1:27017. Ver el servicio "MongoDB" en services.msc.' }
  $MongoUri = "mongodb://127.0.0.1:27017/$Base"
}

# ---------------------------------------------------------------- Archivos
Paso "Archivos en $AppDir"
$servicioActivo = Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
if ($servicioActivo) { Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue }
# libera el puerto si quedo un proceso colgado
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
if ($Raiz.TrimEnd('\') -ne $AppDir.TrimEnd('\')) {
  # copia el codigo (con .git, para poder actualizar con git pull) sin pisar .env, fotos ni dependencias
  robocopy $Raiz $AppDir /MIR /XD node_modules dist uploads /XF .env /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Fallo "robocopy fallo (codigo $LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir 'server\uploads') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir 'logs') | Out-Null

Paso 'Cliente (build) y servidor (dependencias)'
Push-Location (Join-Path $AppDir 'client')
& $Npm ci --no-audit --no-fund; Comprobar 'npm ci (cliente)'
& $Npm run build; Comprobar 'npm run build (cliente)'
Pop-Location
Push-Location (Join-Path $AppDir 'server')
& $Npm ci --omit=dev --no-audit --no-fund; Comprobar 'npm ci (servidor)'
Pop-Location

# ---------------------------------------------------------------- Configuracion
$envPath = Join-Path $AppDir 'server\.env'
$nuevoEnv = $false
$claveAdmin = ''
function Aleatorio($n) {
  $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = New-Object byte[] $n
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}
if (-not (Test-Path $envPath)) {
  Paso 'Configuracion (server\.env)'
  $nuevoEnv = $true
  $claveAdmin = Aleatorio 16
  $jwt = Aleatorio 64
  $ua = if ($GeoUserAgent) { $GeoUserAgent } else { 'campana-inspecciones/1.0 (contacto: definir-en-.env)' }
  $lineas = @(
    "PORT=$Port",
    "MONGO_URI=$MongoUri",
    "JWT_SECRET=$jwt",
    'ADMIN_USERNAME=admin',
    "ADMIN_PASSWORD=$claveAdmin",
    "GEO_USER_AGENT=$ua",
    'GEO_VIEWBOX=-65.33,-26.75,-65.12,-26.93',
    'NODE_ENV=production',
    'SERVE_CLIENT=true'
  )
  if ($Https) { $lineas += 'INSECURE_HTTP=false'; $lineas += 'TRUST_PROXY=1' } else { $lineas += 'INSECURE_HTTP=true' }
  # UTF-8 sin BOM (con BOM, dotenv no lee la primera variable)
  [IO.File]::WriteAllText($envPath, (($lineas -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding $false))
} else {
  Write-Host "Ya existe $envPath: no se modifica."
  $contenido = Get-Content $envPath -Raw
  foreach ($k in @('SERVE_CLIENT=true', 'NODE_ENV=production')) {
    if ($contenido -notmatch "(?m)^$([regex]::Escape($k))\s*$") { Add-Content -Path $envPath -Value $k -Encoding ASCII; Write-Host "Se agrego $k al .env." }
  }
}
# solo SYSTEM y Administradores pueden leer el .env (SID, para que funcione en cualquier idioma)
icacls $envPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
$PortReal = $Port
$m = Select-String -Path $envPath -Pattern '^PORT=(\d+)' | Select-Object -First 1
if ($m) { $PortReal = [int]$m.Matches[0].Groups[1].Value }

# ---------------------------------------------------------------- Datos (opcional)
if ($Datos) {
  Paso "Cargando datos de $Datos"
  if (-not $MongoLocal) { Fallo '-Datos solo se carga en el MongoDB local.' }
  if (-not (Test-Path $Datos)) { Fallo "No existe $Datos" }
  $restore = BuscarExe 'mongorestore.exe' @('C:\Program Files\MongoDB\Tools')
  if (-not $restore) {
    $msi = Join-Path $tmp 'mongodb-database-tools.msi'
    Descargar 'https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-100.10.0.msi' $msi
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fallo "Fallo la instalacion de MongoDB Database Tools (codigo $($p.ExitCode))" }
    $restore = BuscarExe 'mongorestore.exe' @('C:\Program Files\MongoDB\Tools')
    if (-not $restore) { Fallo 'No se encontro mongorestore.exe despues de instalar las Database Tools.' }
  }
  $dir = Join-Path $tmp 'datos'
  Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  tar.exe -xzf $Datos -C $dir; Comprobar 'No se pudo descomprimir el paquete (tar.exe)'
  & $restore --uri $MongoUri "--archive=$dir\mongo.gz" --gzip --drop --nsInclude "$Base.*"; Comprobar 'mongorestore'
  tar.exe -xzf (Join-Path $dir 'uploads.tar.gz') -C (Join-Path $AppDir 'server'); Comprobar 'No se pudieron restaurar las fotos'
}

# ---------------------------------------------------------------- Administrador inicial
Paso 'Administrador inicial'
Push-Location (Join-Path $AppDir 'server')
& $Node seeder.js; Comprobar 'seeder'
Pop-Location

# ---------------------------------------------------------------- Inicio automatico
Paso "Tarea de inicio automatico ($Tarea)"
$log = Join-Path $AppDir 'logs\server.log'
$cmd = "/c `"`"$Node`" server.js >> `"$log`" 2>&1`""
$accion = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory (Join-Path $AppDir 'server')
$disparador = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparador -Settings $ajustes -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $Tarea

# ---------------------------------------------------------------- Firewall
Paso "Firewall de Windows: puerto $PortReal"
Get-NetFirewallRule -DisplayName 'Campana Inspecciones' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Campana Inspecciones' -Direction Inbound -Protocol TCP -LocalPort $PortReal -Action Allow | Out-Null

# ---------------------------------------------------------------- Respaldo diario
if ($MongoLocal) {
  Paso "Respaldo diario (02:30) en $DestinoBackup"
  $dump = BuscarExe 'mongodump.exe' @('C:\Program Files\MongoDB\Tools')
  if (-not $dump) {
    $msi = Join-Path $tmp 'mongodb-database-tools.msi'
    if (-not (Test-Path $msi)) { Descargar 'https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-100.10.0.msi' $msi }
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Write-Host "Aviso: no se pudieron instalar las Database Tools (codigo $($p.ExitCode)); el respaldo diario no se programo." -ForegroundColor Yellow }
  }
  $backupPs1 = Join-Path $AppDir 'deploy\backup-windows.ps1'
  $accionB = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupPs1`" -AppDir `"$AppDir`" -Destino `"$DestinoBackup`""
  $disparadorB = New-ScheduledTaskTrigger -Daily -At '02:30'
  Register-ScheduledTask -TaskName $TareaBackup -Action $accionB -Trigger $disparadorB -Principal $principal -Force | Out-Null
}

# ---------------------------------------------------------------- Verificacion
Paso 'Verificacion'
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$PortReal/api/health" -UseBasicParsing -TimeoutSec 3
    if ($r.ok) { $ok = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $ok) { Fallo "La aplicacion no respondio. Ver el registro: Get-Content `"$log`" -Tail 50" }
Write-Host "La aplicacion responde en http://127.0.0.1:$PortReal" -ForegroundColor Green

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
Write-Host ''
Write-Host "Listo. Abrir http://$($(if ($ip) { $ip } else { '<ip-del-servidor>' })):$PortReal (habilitar ese puerto tambien en el firewall de la nube / red, si corresponde)." -ForegroundColor Green
if ($nuevoEnv -and -not $Datos) { Write-Host "Usuario: admin   Contrasena: $claveAdmin   (guardala y cambiala al entrar)" -ForegroundColor Yellow }
if ($Datos) { Write-Host 'Se cargaron los datos del paquete: se entra con el usuario y la contrasena de la base original.' }
if ((Get-Content $envPath -Raw) -match 'definir-en-\.env') { Write-Host "Pendiente: poner un contacto real en GEO_USER_AGENT dentro de $envPath y reiniciar con: Stop-ScheduledTask $Tarea; Start-ScheduledTask $Tarea" -ForegroundColor Yellow }
if (-not $Https) { Write-Host 'Por HTTP plano usuario y contrasena viajan sin cifrar: usar solo en red interna o poner un proxy con HTTPS (con -Https).' -ForegroundColor Yellow }
Write-Host "Registro: Get-Content '$log' -Tail 50 -Wait"
Write-Host "Reiniciar: Stop-ScheduledTask $Tarea; Start-ScheduledTask $Tarea"
Write-Host "Actualizar: cd $AppDir; git pull; powershell -ExecutionPolicy Bypass -File deploy\instalar-windows.ps1"
