# Cloud Run 部署指南（冷啟動 / scale-to-zero）

專案：`discorddatebot`　服務帳號：`discorddatebot@discorddatebot.iam.gserviceaccount.com`
建議區域：`asia-east1`（台灣）

架構：一個 Cloud Run 服務同時處理 Discord 互動（`/interactions`）和排程（`/cron/*`）。
平常 0 個執行個體（不收費），有請求才冷啟動。

---

## 0. 前置

```bash
gcloud config set project discorddatebot
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com sheets.googleapis.com
```

> 試算表要「分享」給服務帳號 `discorddatebot@discorddatebot.iam.gserviceaccount.com`（檢視者即可）。
> 你現在能讀到資料，代表已經分享過了，確認一下即可。

---

## 1. 部署服務（用原始碼，免寫 Dockerfile）

在專案根目錄執行（把 `<...>` 換成 `.env` 裡對應的值）：

```bash
gcloud run deploy ffxiv-raid-bot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --service-account discorddatebot@discorddatebot.iam.gserviceaccount.com \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "DISCORD_PUBLIC_KEY=<public_key>,DISCORD_CLIENT_ID=<client_id>,SPREADSHEET_ID=<sheet_id>,DISCORD_WEBHOOK_URL=<webhook_url>"
```

重點說明：
- `--min-instances 0`：就是你要的冷啟動 / scale-to-zero（沒人用就不收費）。
- `--allow-unauthenticated`：**必須**。Discord 沒辦法帶 Google 的 IAM token，端點必須公開；
  安全性靠程式裡的 Ed25519 簽章驗證（`verifyKeyMiddleware`）把關。
- `--service-account ...`：用這個身分跑 → 程式自動用 ADC 讀表，**不需要上傳 `credentials.json`**。
- **不要**設 `PORT`，Cloud Run 會自動注入 `8080`，`index.js` 已經會讀 `process.env.PORT`。
- `DISCORD_TOKEN` 伺服器端用不到（只有註冊指令時要，見步驟 3），不必設。

部署完成會給你一個網址，例如：
`https://ffxiv-raid-bot-xxxxxxxxxx.asia-east1.run.app`　← 下面叫它 `SERVICE_URL`

> 進階（正式環境建議）：webhook URL 這類較敏感的值，可改用 Secret Manager：
> `--set-secrets "DISCORD_WEBHOOK_URL=discord-webhook:latest"`，先 `gcloud secrets create ...` 建好。

---

## 2. 註冊斜線指令（一次性，在本機跑）

`register.js` 只是呼叫 Discord API，不需要部署，在本機用 `.env`（要有 `DISCORD_TOKEN`、`DISCORD_CLIENT_ID`）執行：

```bash
npm run register
```

> 全域指令最久可能要等 ~1 小時才在所有伺服器生效。要立刻測試可改成「單一伺服器(guild)註冊」。

---

## 3. 綁定 Discord 互動端點

Discord Developer Portal → 你的 App → **General Information** →
`Interactions Endpoint URL` 填：

```
https://SERVICE_URL/interactions
```

按 Save 時 Discord 會送一個 PING，程式要在 ~3 秒內回 PONG。

> ⚠️ 冷啟動風險：服務閒置後第一次被打，Node 容器冷啟動約 2~4 秒，**第一次 Save 可能超時失敗**。
> 解法：重試一兩次；或暫時把服務改成 `--min-instances 1` 完成綁定後再改回 0。

---

## 4. 設定 Cloud Scheduler 排程

時區直接選 `Asia/Taipei`，不用自己換算 UTC。

```bash
# 週六中午 12:00 — 催填（誰還沒填下一個 CD 週）
gcloud scheduler jobs create http saturday-unfilled \
  --location asia-east1 \
  --schedule "0 12 * * 6" \
  --time-zone "Asia/Taipei" \
  --uri "https://SERVICE_URL/cron/saturday-unfilled" \
  --http-method POST

# 週日催填（既有）
gcloud scheduler jobs create http sunday-reminder \
  --location asia-east1 \
  --schedule "0 12 * * 0" \
  --time-zone "Asia/Taipei" \
  --uri "https://SERVICE_URL/cron/sunday-reminder" \
  --http-method POST

# 週一出團公告（既有）
gcloud scheduler jobs create http monday-schedule \
  --location asia-east1 \
  --schedule "0 9 * * 1" \
  --time-zone "Asia/Taipei" \
  --uri "https://SERVICE_URL/cron/monday-schedule" \
  --http-method POST
```

cron 欄位＝「分 時 日 月 星期」。星期：0=日、1=一 …… 6=六。

手動測一次某個排程（不必等到時間到）：
```bash
gcloud scheduler jobs run saturday-unfilled --location asia-east1
```

---

## 5. 冷啟動注意事項

- **Discord 互動**：PING→PONG、以及指令的第一個回應必須 <3 秒。冷啟動可能讓「閒置後的第一個指令」逾時；
  通常再按一次就好（這時已經熱機）。`/ask`、`/askdate` 都用 DEFERRED 回應，所以查表的耗時不是問題，**只有冷開機那幾秒**是風險。
  完全不能容忍就設 `--min-instances 1`（會有小額常態費用）。
- **Scheduler→/cron**：沒有 3 秒限制，冷啟動沒影響。

---

## 6. 安全性建議（選配）

因為服務是公開的（Discord 要求），`/cron/*` 也等於對外公開，任何人知道網址就能觸發催填訊息。
建議加一道「共用密鑰」檢查：Scheduler 送一個自訂 header，程式比對 `CRON_SECRET` 才執行。
需要的話我可以幫你加上這段 middleware，並在上面的 scheduler 指令加 `--headers "X-Cron-Secret=..."`。

---

## 重新部署

改完程式後，重跑步驟 1 的 `gcloud run deploy ... --source .` 即可（環境變數沒變可省略 `--set-env-vars`）。
