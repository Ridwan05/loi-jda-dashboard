$ErrorActionPreference = "Stop"

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "public"))
$startPort = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$port = $startPort
$types = @{
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".jsx" = "text/babel; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
}

function Send-Response($stream, $status, $contentType, [byte[]]$body) {
  $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  $stream.Write($body, 0, $body.Length)
}

$listener = $null
while (-not $listener) {
  try {
    $candidate = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    $candidate.Start()
    $listener = $candidate
  } catch [Net.Sockets.SocketException] {
    if ($env:PORT) {
      throw "Port $port is already in use. Stop the process using it or choose another port with `$env:PORT = 3001."
    }

    $port += 1
    if ($port -gt ($startPort + 20)) {
      throw "Could not find an available local port between $startPort and $port."
    }
  }
}

if ($port -ne $startPort) {
  Write-Host "Port $startPort is already in use, using $port instead."
}
Write-Host "LOI -> JDA Conversion Tracker: http://localhost:$port/"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = New-Object byte[] 4096
      $count = $stream.Read($buffer, 0, $buffer.Length)
      if ($count -le 0) { continue }

      $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $count)
      $requestLine = ($request -split "`r?`n")[0]
      $parts = $requestLine -split " "
      $requestPath = if ($parts.Length -ge 2) { [Uri]::UnescapeDataString($parts[1]) } else { "/" }
      if ($requestPath -eq "/") { $requestPath = "/index.html" }
      $requestPath = ($requestPath -split "\?")[0]

      $relativePath = $requestPath.TrimStart("/") -replace "/", [IO.Path]::DirectorySeparatorChar
      $filePath = [IO.Path]::GetFullPath((Join-Path $root $relativePath))

      if (-not $filePath.StartsWith($root)) {
        Send-Response $stream "403 Forbidden" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Forbidden"))
      } elseif (Test-Path -LiteralPath $filePath -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($filePath)
        $contentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        Send-Response $stream "200 OK" $contentType ([IO.File]::ReadAllBytes($filePath))
      } else {
        Send-Response $stream "404 Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
