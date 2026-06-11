require('dotenv').config();
const express = require('express');
const { verifyKeyMiddleware, InteractionType, InteractionResponseType } = require('discord-interactions');
const { getRaidDates } = require('./sheet');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

// ── 啟動時確認環境變數 ─────────────────────────────────────────
console.log('========================================');
console.log('[STARTUP] 環境變數確認：');
console.log(`   PORT       : ${PORT}`);
console.log(`   PUBLIC_KEY : ${PUBLIC_KEY ? PUBLIC_KEY.slice(0, 8) + '... (已載入)' : '❌ 未載入！請檢查 .env'}`);
console.log('========================================\n');

// ── 全域請求日誌（最高優先順序，所有請求都會經過）─────────────
// ⚠️  這個 middleware 必須在所有路由之前，包括 express.json()
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  const sigEd  = req.headers['x-signature-ed25519'];
  const sigTs  = req.headers['x-signature-timestamp'];
  console.log(`\n[${ts}] ▶ 收到請求: ${req.method} ${req.path}`);
  console.log(`   x-signature-ed25519   : ${sigEd  ? `✅ ${sigEd.slice(0, 16)}...`  : '❌ 未提供（非 Discord 請求）'}`);
  console.log(`   x-signature-timestamp : ${sigTs  ? `✅ ${sigTs}` : '❌ 未提供'}`);
  next();
});

// ── 健康檢查 ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('✅ Bot server is running!');
});

// ── /interactions 端點 ────────────────────────────────────────
// ⚠️  重要：verifyKeyMiddleware 需要讀取 Raw Body 來驗證 Ed25519 簽章。
//     絕對不可在它之前掛載全域 express.json()，否則 stream 被消費後驗證必定失敗。
app.post(
  '/interactions',
  (req, res, next) => {
    console.log('[VERIFY]      ▶ 進入 Discord 簽章驗證...');
    next();
  },
  verifyKeyMiddleware(PUBLIC_KEY),
  async (req, res) => {
    const interaction = req.body;
    console.log(`[INTERACTION] ✅ 簽章驗證通過！Type = ${interaction.type}`);

    // Type 1：Ping（Discord 綁定 URL 時發送）
    if (interaction.type === InteractionType.PING) {
      console.log('[INTERACTION] ↩  回傳 Pong！');
      return res.json({ type: InteractionResponseType.PONG });
    }

    // Type 2：Slash Command
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const cmdName = interaction.data?.name ?? '(unknown)';
      console.log(`[INTERACTION] ↩  處理指令: /${cmdName}`);

      // ⚔️ /ask：讀取 Google Sheet 排班資料後回答
      if (cmdName === 'ask') {
        const interactionToken = interaction.token;
        const appId = process.env.DISCORD_CLIENT_ID;
        const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;

        // 1. ⚡ 第一件事先回應 Discord，保證在 3 秒內送出，爭取最多 15 分鐘的處理時間
        res.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

        try {
          const userQuestion = interaction.data.options[0].value;

          // 2. 🐢 背景去慢慢查表單
          console.log('[INTERACTION] ⏳ 已發送思考中狀態，開始呼叫 Google Sheets API...');
          const schedule = await getRaidDates();
          console.log('[INTERACTION] ✅ Google Sheets API 查詢完成！準備更新訊息...');

          // 3. 📝 查完之後，透過 Discord 的 REST API "編輯" 剛剛那個思考中的訊息
          await fetch(patchUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `你問了：「${userQuestion}」\n\n這是我去查表單的結果：\n${schedule}`
            })
          });
        } catch (error) {
          console.error('[INTERACTION] ❌ 執行 /ask 時發生錯誤：', error);

          // 如果報錯了，也要記得更新訊息，不然頻道會一直卡在思考中
          await fetch(patchUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '❌ 腦袋當機了，去查表單的時候摔了一跤...' })
          });
        }
        return;
      }

      // 📝 /note：預留功能
      if (cmdName === 'note') {
        const noteContent = interaction.data.options[0].value;
        return res.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ 已經幫你把筆記「${noteContent}」記下來囉！（資料庫連線即將實裝）`,
          },
        });
      }

      // 其他未知指令
      return res.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '⚔️ 光之助理連線成功！不過我的大腦還沒裝上去，稍等我一下！' },
      });
    }

    console.log(`[INTERACTION] ⚠  未知的 Interaction Type: ${interaction.type}`);
    return res.status(400).json({ error: 'Unknown interaction type' });
  }
);

// ── 全域錯誤捕捉（含 verifyKeyMiddleware 拋出的錯誤）──────────
app.use((err, req, res, next) => {
  console.error(`\n[ERROR] ❌ 捕捉到錯誤 on ${req.method} ${req.path}`);
  console.error(`   狀態碼 : ${err.status || 500}`);
  console.error(`   訊息   : ${err.message}`);
  res.status(err.status || 500).send(err.message || 'Internal Server Error');
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動成功！正在監聽 Port ${PORT}`);
  console.log(`   本機健康檢查 : http://localhost:${PORT}/`);
  console.log(`   Interactions  : http://localhost:${PORT}/interactions\n`);
});