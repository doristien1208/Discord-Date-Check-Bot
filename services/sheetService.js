const fs = require('fs');
const { google } = require('googleapis');
const { toDate, dateKey } = require('./scheduleGridService');

// 本機有 credentials.json 就用它；雲端(Cloud Run)沒有檔案時，
// 自動改用執行身分的服務帳號 (ADC) — 不需要把金鑰打包進映像檔。
const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] };
if (fs.existsSync('./credentials.json')) authOptions.keyFile = './credentials.json';
const auth = new google.auth.GoogleAuth(authOptions);

// 解析 A 欄日期字串，例如 "6月22日 Mon" → {month:6, day:22}
const CN_DATE_RE = /(\d{1,2})月(\d{1,2})日/;

/**
 * 從「當前總時數計算」A 欄抓出團日期，回傳「今天(含)以後」的所有日期。
 * @param {Date} ref 參考日(預設今天)
 * @returns {Promise<string[]>} 例如 ['6/23','6/24','6/25']，依時間排序、去重
 */
async function getUpcomingRaidDates(ref = new Date()) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'當前總時數計算'!A2:A1000",
  });
  const rows = response?.data?.values || [];

  const today = new Date(ref); today.setHours(0, 0, 0, 0);

  const dates = rows
    .map(r => r[0])
    .map(cell => {
      const m = String(cell ?? '').match(CN_DATE_RE);
      return m ? toDate(parseInt(m[1], 10), parseInt(m[2], 10), ref) : null;
    })
    .filter(d => d && d >= today)        // 只留今天(含)以後
    .sort((a, b) => a - b)
    .map(d => dateKey(d));               // 轉成 "M/D"

  return [...new Set(dates)];            // 去重
}

// 依「標題列文字」找出各欄的索引（容錯：欄位順序變了也找得到）。
// 日期欄(A)沒有標題，所以固定用第 0 欄。
function buildColMap(headers) {
  const idx = { date: 0 };
  headers.forEach((h, i) => {
    const t = String(h ?? '');
    if (/練團時間|時間\(hr\)|hr/i.test(t)) idx.hours = i;
    else if (/phase/i.test(t)) idx.phase = i;
    else if (/血量|hp|血/i.test(t)) idx.hp = i;
    else if (/pull|場次|把/i.test(t)) idx.pulls = i;
    else if (/總時數/.test(t)) idx.total = i;
  });
  return idx;
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

/**
 * 讀「當前總時數計算」整張表，容錯解析成練團紀錄並計算拓荒進度統計。
 * 任何欄位空白或壞掉都不會讓計算崩潰——缺的就略過、只用有的資料算。
 * @returns {Promise<object>} 進度統計（給 /ask tour 用）
 */
async function getProgress(ref = new Date()) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'當前總時數計算'!A1:Z1000",
  });
  const grid = response?.data?.values || [];
  const headers = grid[0] || [];
  const col = buildColMap(headers);

  // 逐列解析。注意：只有日期、其餘全空的列是「未來的出團佔位日」，不算練團，
  // 必須至少有 時數 / phase / 場次 / 血量 其中之一，才算一場真正練過的團。
  const sessions = [];
  for (const r of grid.slice(1)) {
    const dm = String(r[col.date] ?? '').match(CN_DATE_RE);
    if (!dm) continue; // 沒日期 → 空白/壞掉的列，跳過
    const date = toDate(parseInt(dm[1], 10), parseInt(dm[2], 10), ref);
    const pm = col.phase != null ? String(r[col.phase] ?? '').match(/P\s*(\d+)/i) : null;

    const hours = col.hours != null ? num(r[col.hours]) : null;
    const phase = pm ? parseInt(pm[1], 10) : null;
    const hp = col.hp != null ? num(r[col.hp]) : null;
    const pulls = col.pulls != null ? num(r[col.pulls]) : null;

    // 沒有任何練團資料(只有日期) → 視為尚未練的佔位日，不計入
    const hasData = (hours != null && hours > 0) || phase != null || (pulls != null && pulls > 0) || hp != null;
    if (!hasData) continue;

    sessions.push({ date, dateStr: dateKey(date), hours, phase, hp, pulls });
  }
  sessions.sort((a, b) => a.date - b.date);

  const totalHours = sessions.reduce((s, x) => s + (x.hours || 0), 0);
  const totalPulls = sessions.reduce((s, x) => s + (x.pulls || 0), 0);
  const avgMinPerPull = totalPulls > 0 ? (totalHours * 60) / totalPulls : null;

  const withPhase = sessions.filter(x => x.phase != null);
  const furthest = withPhase.length ? Math.max(...withPhase.map(x => x.phase)) : null;

  let bestHp = null;
  if (furthest != null) {
    const hps = sessions.filter(x => x.phase === furthest && x.hp != null).map(x => x.hp);
    bestHp = hps.length ? Math.min(...hps) : null;
  }

  // 各 phase 首次抵達日（抵達 Pn 代表也通過了前面的 phase，所以用 phase>=n）
  const timeline = [];
  if (furthest != null) {
    for (let p = 1; p <= furthest; p++) {
      const first = sessions.find(x => x.phase != null && x.phase >= p);
      if (first) timeline.push({ phase: p, dateStr: first.dateStr });
    }
  }

  // 卡關：自「首次抵達最遠 phase」以來，幾天 / 幾把還沒突破
  let stuck = null;
  if (furthest != null) {
    const firstFurthest = sessions.find(x => x.phase === furthest);
    if (firstFurthest) {
      const since = firstFurthest.date;
      const rowsSince = sessions.filter(x => x.date >= since);
      stuck = {
        sinceStr: firstFurthest.dateStr,
        days: new Set(rowsSince.map(x => x.dateStr)).size,
        pulls: rowsSince.reduce((s, x) => s + (x.pulls || 0), 0),
      };
    }
  }

  return {
    count: sessions.length,
    totalHours: Math.round(totalHours * 10) / 10,
    totalPulls,
    avgMinPerPull,
    furthest,
    bestHp,
    cleared: furthest != null && bestHp === 0,
    timeline,
    stuck,
  };
}

module.exports = { getUpcomingRaidDates, getProgress };
