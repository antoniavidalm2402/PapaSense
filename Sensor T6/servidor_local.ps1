# =============================================================
# PapaSense T-6 - Servidor HTTP Local (TcpListener Puro)
# Permite conexion desde esta PC y desde celulares Android en la misma red Wi-Fi
# Funciona en Windows sin requerir permisos de administrador ni http.sys
# =============================================================

$port = 8080
$root = $PSScriptRoot

# Obtener IP local de la maquina para acceso desde el celular
$localIp = "127.0.0.1"
try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        $_.InterfaceAlias -notmatch "Loopback|Virtual|vEthernet" -and $_.IPAddress -notlike "169.254*" 
    } | Select-Object -First 1
    if ($ipObj) { $localIp = $ipObj.IPAddress }
} catch {
    $localIp = "127.0.0.1"
}

# Abrir listener en 0.0.0.0 (Any) para permitir conexiones de PC y Celular
$listener = $null
while ($port -lt 8090) {
    try {
        $ip = [System.Net.IPAddress]::Any
        $listener = [System.Net.Sockets.TcpListener]::new($ip, $port)
        $listener.Start()
        break
    } catch {
        $port++
    }
}

if ($null -eq $listener) {
    Write-Host "[ERROR] No se pudo abrir un puerto local." -ForegroundColor Red
    pause
    exit
}

$urlLocal = "http://localhost:$port/index.html"
$urlCelular = "http://$($localIp):$port/index.html"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   PapaSense T-6 - Servidor Local Seguro Activo" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Acceso en esta PC:       $urlLocal" -ForegroundColor Yellow
if ($localIp -ne "127.0.0.1") {
    Write-Host "  Acceso desde tu Celular: $urlCelular" -ForegroundColor Cyan
    Write-Host "  (Abre ese enlace en Chrome en tu celular conectado a la misma red Wi-Fi)" -ForegroundColor Gray
}
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Iniciando navegador en la PC..." -ForegroundColor White
Start-Process $urlLocal
Write-Host "  [OK] Esperando conexiones. Cierre esta ventana al terminar." -ForegroundColor Gray
Write-Host ""

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".apk"  = "application/vnd.android.package-archive"
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII)

        # Leer primera linea HTTP (GET /path HTTP/1.1)
        $line = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($line)) {
            $client.Close()
            continue
        }

        $parts = $line.Split(' ')
        if ($parts.Length -ge 2) {
            $reqPath = $parts[1].Split('?')[0] # quitar query string si hay
            if ($reqPath -eq "/" -or $reqPath -eq "") { $reqPath = "/index.html" }

            $filePath = Join-Path $root ($reqPath.TrimStart("/").Replace("/", "\"))

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)

                $header = "HTTP/1.1 200 OK`r`n" +
                          "Content-Type: $contentType`r`n" +
                          "Content-Length: $($bytes.Length)`r`n" +
                          "Access-Control-Allow-Origin: *`r`n" +
                          "Connection: close`r`n`r`n"
                
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
            } else {
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 - Archivo no encontrado")
                $header = "HTTP/1.1 404 Not Found`r`n" +
                          "Content-Type: text/plain; charset=utf-8`r`n" +
                          "Content-Length: $($notFound.Length)`r`n" +
                          "Connection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($notFound, 0, $notFound.Length)
            }
        }
        $stream.Flush()
        $client.Close()
    }
} finally {
    $listener.Stop()
}
