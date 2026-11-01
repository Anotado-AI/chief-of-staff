# Entrada del instalador del Chief of Staff en Windows. Busca Node (o lo baja a la carpeta del usuario,
# sin permisos de administrador) y le pasa el paso a cos.mjs. Funciona desde PowerShell, cmd o Git Bash:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<carpeta>\instalador\cos.ps1" <paso> [opciones]
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$Casa = if ($env:COS_HOME) { $env:COS_HOME } else { Join-Path $HOME '.chief-of-staff' }
$NodeVersion = 'v22.23.4'
$NodeLocal = Join-Path $Casa 'herramientas\node\node.exe'

function Test-NodeSirve([string]$Ruta) {
  if (-not $Ruta -or -not (Test-Path $Ruta)) { return $false }
  # Sin comillas dentro: PowerShell 5.1 las quita al pasarle el texto a node.
  try { return [int]((& $Ruta -p 'process.versions.node') -split '\.')[0] -ge 20 } catch { return $false }
}

function Get-NodeOficial {
  $arq = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
  $carpeta = "node-$NodeVersion-$arq"
  $archivo = "$carpeta.zip"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  [Console]::Error.WriteLine("Bajando Node $NodeVersion de nodejs.org (una sola vez, unos 35 MB)...")
  Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/$archivo" -OutFile (Join-Path $tmp $archivo) -UseBasicParsing
  $sumas = (Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
  if ($sumas -is [byte[]]) { $sumas = [Text.Encoding]::ASCII.GetString($sumas) }
  $renglon = ($sumas -split "`n") | Where-Object { $_.Trim().EndsWith("  $archivo") } | Select-Object -First 1
  $esperado = if ($renglon) { ($renglon.Trim() -split '\s+')[0].ToLower() } else { '' }
  $real = (Get-FileHash (Join-Path $tmp $archivo) -Algorithm SHA256).Hash.ToLower()
  if (-not $esperado -or $esperado -ne $real) {
    Remove-Item -Recurse -Force $tmp
    Write-Output '{"ok":false,"error":"La descarga de Node no coincide con la firma publicada; no se instal\u00f3"}'
    exit 1
  }
  Expand-Archive (Join-Path $tmp $archivo) -DestinationPath $tmp -Force
  $destino = Join-Path $Casa 'herramientas\node'
  if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
  New-Item -ItemType Directory -Path (Split-Path $destino) -Force | Out-Null
  Move-Item (Join-Path $tmp $carpeta) $destino
  Remove-Item -Recurse -Force $tmp
}

$sistema = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $env:COS_FORZAR_NODE -and (Test-NodeSirve $sistema)) { $node = $sistema }
elseif (Test-NodeSirve $NodeLocal) { $node = $NodeLocal }
else { Get-NodeOficial; $node = $NodeLocal }

# Las comillas dentro de un argumento no llegan intactas a node desde PowerShell 5.1: un JSON para
# "cos herramienta" va en un archivo (INSTALAR.md lo dice).
& $node (Join-Path $Aqui 'cos.mjs') @args
exit $LASTEXITCODE
