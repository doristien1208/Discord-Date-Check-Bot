#!/usr/bin/env bash
# Cloud Run 一鍵部署 (Mac / Linux / Windows 的 Git Bash 或 WSL)。
# 用法： bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

# 安全讀取 .env：用 grep 取值，不 source、不執行內容，
# 並去掉 Windows 換行(\r)，所以 .env 不論在 Mac 或 Windows 存的都能用。
read_env() {
  grep -E "^$1=" .env | head -n1 | sed -e "s/^$1=//" -e 's/\r$//'
}

DISCORD_PUBLIC_KEY="$(read_env DISCORD_PUBLIC_KEY)"
DISCORD_CLIENT_ID="$(read_env DISCORD_CLIENT_ID)"
SPREADSHEET_ID="$(read_env SPREADSHEET_ID)"
DISCORD_WEBHOOK_URL="$(read_env DISCORD_WEBHOOK_URL)"

for k in DISCORD_PUBLIC_KEY DISCORD_CLIENT_ID SPREADSHEET_ID DISCORD_WEBHOOK_URL; do
  if [ -z "${!k}" ]; then echo ".env 缺少 $k，請檢查"; exit 1; fi
done

SERVICE="ffxiv-raid-bot"
REGION="asia-east1"
SA="discorddatebot@discorddatebot.iam.gserviceaccount.com"

# 用 ^@^ 當分隔符，避免值裡有逗號(如 webhook 網址)被誤切
ENV_VARS="^@^DISCORD_PUBLIC_KEY=${DISCORD_PUBLIC_KEY}@DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}@SPREADSHEET_ID=${SPREADSHEET_ID}@DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}"

echo "開始部署到 Cloud Run (${REGION})..."
gcloud run deploy "${SERVICE}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --service-account "${SA}" \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "${ENV_VARS}"

echo
echo "部署完成。服務網址："
gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)'
