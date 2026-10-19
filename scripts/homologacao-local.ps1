# Pacote 02 - homologação isolada para Windows / VS Code / PowerShell 7 ou Windows PowerShell 5.1.
# NÃO utiliza o banco real e NÃO executa transferências externas.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$oldDatabase = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
$oldIsolated = [Environment]::GetEnvironmentVariable('ISOLATED_HOMOLOGATION', 'Process')
$oldBase = [Environment]::GetEnvironmentVariable('HOMOLOG_BASE_URL', 'Process')
$oldEmail = [Environment]::GetEnvironmentVariable('HOMOLOG_ADMIN_EMAIL', 'Process')
$oldPassword = [Environment]::GetEnvironmentVariable('HOMOLOG_ADMIN_PASSWORD', 'Process')
$oldProducerPassword = [Environment]::GetEnvironmentVariable('HOMOLOG_PRODUCER_PASSWORD', 'Process')
$oldBootstrapEmail = [Environment]::GetEnvironmentVariable('BOOTSTRAP_ADMIN_EMAIL', 'Process')
$oldBootstrapPassword = [Environment]::GetEnvironmentVariable('BOOTSTRAP_ADMIN_PASSWORD', 'Process')
$oldBootstrapName = [Environment]::GetEnvironmentVariable('BOOTSTRAP_ADMIN_NAME', 'Process')
$server = $null
$failed = $false
$guid = [guid]::NewGuid().ToString('N')
$dbName = "homologacao-$guid.db"
$dbPath = Join-Path (Join-Path $root 'prisma') $dbName
$env:DATABASE_URL = "file:./$dbName"
$env:ISOLATED_HOMOLOGATION = 'SIM'
$env:HOMOLOG_ADMIN_EMAIL = 'administrador.homologacao@example.invalid'
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$adminBytes = New-Object byte[] 32
$producerBytes = New-Object byte[] 32
$rng.GetBytes($adminBytes)
$rng.GetBytes($producerBytes)
$rng.Dispose()
$env:HOMOLOG_ADMIN_PASSWORD = [Convert]::ToBase64String($adminBytes)
$env:HOMOLOG_PRODUCER_PASSWORD = [Convert]::ToBase64String($producerBytes)
$env:BOOTSTRAP_ADMIN_EMAIL = $env:HOMOLOG_ADMIN_EMAIL
$env:BOOTSTRAP_ADMIN_PASSWORD = $env:HOMOLOG_ADMIN_PASSWORD
$env:BOOTSTRAP_ADMIN_NAME = 'Administrador de Homologação'
$listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$env:HOMOLOG_BASE_URL = "http://127.0.0.1:$port"
$logRoot = Join-Path $root 'homologacao-resultados'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$stdout = Join-Path $logRoot "next-$guid.stdout.log"
$stderr = Join-Path $logRoot "next-$guid.stderr.log"
function RunChecked([string] $Description, [scriptblock] $Operation) {
  Write-Host "==> $Description" -ForegroundColor Cyan
  & $Operation
  if ($LASTEXITCODE -ne 0) { throw "$Description falhou (código $LASTEXITCODE)" }
}
try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 e npm e abra novamente o VS Code.' }
  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    RunChecked 'Instalar dependências' { npm install --no-audit --no-fund }
  }
  RunChecked 'Gerar cliente Prisma para SQLite isolado' { npm run db:generate }
  RunChecked 'Criar base temporária isolada via Prisma' { npm run db:push }
  RunChecked 'Criar administrador temporário' { npm run bootstrap }
  RunChecked 'Testar lógica de cálculo' { npm test }
  RunChecked 'Checagem TypeScript' { npm run typecheck }
  RunChecked 'Compilar projeto Next.js' { npm run build }
  Write-Host "==> Iniciar servidor local de homologação em $($env:HOMOLOG_BASE_URL)" -ForegroundColor Cyan
  $nextCLI = Join-Path $root 'node_modules/next/dist/bin/next'
  if (-not (Test-Path $nextCLI)) { throw 'CLI do Next.js não encontrado após instalação.' }
  $server = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($nextCLI, 'start', '-p', "$port", '-H', '127.0.0.1') -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($server.HasExited) { throw "Servidor encerrou antes dos testes. Veja $stderr" }
    try {
      $response = Invoke-WebRequest -Uri "$($env:HOMOLOG_BASE_URL)/login" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 750 }
  }
  if (-not $ready) { throw "Servidor não iniciou. Veja $stderr" }
  RunChecked 'Executar testes reais HTTP/Prisma/SQLite sem operações bancárias externas' { node scripts/homologacao-integrada.mjs }
  Write-Host 'HOMOLOGAÇÃO INTEGRADA APROVADA (apenas SQLite isolado).' -ForegroundColor Green
} catch {
  Write-Host "HOMOLOGAÇÃO PENDENTE OU REPROVADA: $_" -ForegroundColor Red
  Write-Host "Logs do servidor (se iniciado): $logRoot"
  $failed = $true
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  foreach ($suffix in @('', '-wal', '-shm', '-journal')) {
    $p = "$dbPath$suffix"
    if (Test-Path $p) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }
  }
  [Environment]::SetEnvironmentVariable('DATABASE_URL', $oldDatabase, 'Process')
  [Environment]::SetEnvironmentVariable('ISOLATED_HOMOLOGATION', $oldIsolated, 'Process')
  [Environment]::SetEnvironmentVariable('HOMOLOG_BASE_URL', $oldBase, 'Process')
  [Environment]::SetEnvironmentVariable('HOMOLOG_ADMIN_EMAIL', $oldEmail, 'Process')
  [Environment]::SetEnvironmentVariable('HOMOLOG_ADMIN_PASSWORD', $oldPassword, 'Process')
  [Environment]::SetEnvironmentVariable('HOMOLOG_PRODUCER_PASSWORD', $oldProducerPassword, 'Process')
  [Environment]::SetEnvironmentVariable('BOOTSTRAP_ADMIN_EMAIL', $oldBootstrapEmail, 'Process')
  [Environment]::SetEnvironmentVariable('BOOTSTRAP_ADMIN_PASSWORD', $oldBootstrapPassword, 'Process')
  [Environment]::SetEnvironmentVariable('BOOTSTRAP_ADMIN_NAME', $oldBootstrapName, 'Process')
}

if ($failed) { exit 1 }
