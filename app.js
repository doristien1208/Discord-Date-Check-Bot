const express = require('express');
const requestLogger = require('./middlewares/requestLogger');
const healthRouter = require('./routes/health');
const interactionsRouter = require('./routes/interactions');
const cronRouter = require('./routes/cron');

const app = express();

// ── 啟動時確認環境變數 ─────────────────────────────────────────
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
console.log('========================================');
console.log('[STARTUP] 環境變數確認：');
console.log(`   PORT       : ${process.env.PORT || 3000}`);
console.log(`   PUBLIC_KEY : ${PUBLIC_KEY ? PUBLIC_KEY.slice(0, 8) + '... (已載入)' : ' 未載入！請檢查 .env'}`);
console.log('========================================\n');

// ── Middleware ─────────────────────────────────────────────────
// requestLogger 必須在所有路由之前，包括 express.json()
app.use(requestLogger);

// ── 路由 ───────────────────────────────────────────────────────
app.use('/', healthRouter);
app.use('/', interactionsRouter);
app.use('/', cronRouter);

// ── 全域錯誤捕捉（含 verifyKeyMiddleware 拋出的錯誤）──────────
app.use((err, req, res, next) => {
  console.error(`\n[ERROR]  捕捉到錯誤 on ${req.method} ${req.path}`);
  console.error(`   狀態碼 : ${err.status || 500}`);
  console.error(`   訊息   : ${err.message}`);
  res.status(err.status || 500).send(err.message || 'Internal Server Error');
});

module.exports = app;
