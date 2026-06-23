# Cloud Run 一鍵部署 (Windows PowerShell 原生)。
# 用法（在專案資料夾）： .\deploy.ps1
# 若被擋： 先執行 Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 從 .env 安全讀值（不執行內容、自動去掉 \r）
function Read-Env($key) {
  $m = Select-String -Path ".env" -Pattern "^$key=" | Select-Object -First 1
  if (-not $m) { return "" }
  return (($m.Line -replace "^$key=", "") -replace "`r$", "")
}

$pk  = Read-Env "DISCORD_PUBLIC_KEY"
$cid = Read-Env "DISCORD_CLIENT_ID"
$sid = Read-Env "SPREADSHEET_ID"
$wh  = Read-Env "DISCORD_WEBHOOK_URL"

foreach ($p in @(
    @("DISCORD_PUBLIC_KEY", $pk), @("DISCORD_CLIENT_ID", $cid),
    @("SPREADSHEET_ID", $sid), @("DISCORD_WEBHOOK_URL", $wh))) {
  if ([string]::IsNullOrEmpty($p[1])) { Write-Error ".env 缺少 $($p[0])"; exit 1 }
}

$service = "ffxiv-raid-bot"
$region  = "asia-east1"
$sa      = "discorddatebot@discorddatebot.iam.gserviceaccount.com"
$envVars = "^@^DISCORD_PUBLIC_KEY=$pk@DISCORD_CLIENT_ID=$cid@SPREADSHEET_ID=$sid@DISCORD_WEBHOOK_URL=$wh"

Write-Host "開始部署到 Cloud Run ($region)..."
gcloud run deploy $service `
  --source . `
  --region $region `
  --allow-unauthenticated `
  --service-account $sa `
  --min-instances 0 `
  --max-instances 2 `
  --set-env-vars $envVars

Write-Host ""
Write-Host "部署完成。服務網址："
gcloud run services describe $service --region $region --format='value(status.url)'
