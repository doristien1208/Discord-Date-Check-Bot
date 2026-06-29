// ────────────────────────────────────────────────────────────────
//  出團時間表解析服務
//
//  「出團時間表」分頁是一堆「週區塊」直向堆疊：
//     - 每個區塊有一列「日期列」(例如 6/23 6/24 ... 6/29)，欄數不固定，
//       最上面甚至有只有 1 天 (6/22) 的零頭區塊。
//     - 日期列下方接著 8 位成員，A 欄是名字，對應欄位填 O / X / △ / 空白。
//
//  因為欄位位置會變動，這裡「不寫死欄位」，而是逐列掃描、用「日期錨點」
//  動態建立 欄位index → 日期 的對照，再讀下方成員列。
//
//  解析結果為「攤平的 日期 → {成員: 狀態}」對照，方便任意日期區間查詢。
// ────────────────────────────────────────────────────────────────

const fs = require('fs');
const { google } = require('googleapis');
const { MEMBERS } = require('../config/members');

const SHEET_NAME = '出團時間表';
const READ_RANGE = `'${SHEET_NAME}'!A1:Z1000`;

// 本機有 credentials.json 就用它；雲端(Cloud Run)沒有檔案時改用 ADC(執行身分的服務帳號)。
const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] };
if (fs.existsSync('./credentials.json')) authOptions.keyFile = './credentials.json';
const auth = new google.auth.GoogleAuth(authOptions);

const KNOWN_NAMES = new Set(MEMBERS.map(m => m.sheetName));
const DATE_RE = /^(\d{1,2})\/(\d{1,2})$/; // 例如 6/23

/** 讀取整片「出團時間表」原始二維陣列 */
async function fetchGrid() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: READ_RANGE,
  });
  return response?.data?.values || [];
}

/**
 * 把 "M/D" 轉成 Date。試算表沒有年份，用參考日期推算最合理的年份，
 * 處理跨年 (12月 → 1月) 的情形。
 */
function toDate(month, day, ref = new Date()) {
  const y = ref.getFullYear();
  let d = new Date(y, month - 1, day);
  // 若推出來的日期離參考日太遠 (超過半年前)，視為明年；太遠的未來則視為去年。
  const DAY = 86400000;
  const diff = (d - ref) / DAY;
  if (diff < -182) d = new Date(y + 1, month - 1, day);
  else if (diff > 182) d = new Date(y - 1, month - 1, day);
  return d;
}

function dateKey(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 解析整片 grid → 攤平的排班表。
 * @returns {Map<string, {date: Date, statuses: Object<string,string>}>}
 *          key 為 "M/D"
 */
function parseSchedule(grid, ref = new Date()) {
  const schedule = new Map();
  let currentCols = null; // { colIndex: Date }

  for (const rawRow of grid) {
    const row = rawRow || [];

    // 這一列是不是「日期列」？(任一格符合 M/D)
    const dateCols = {};
    let hasDate = false;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').trim();
      const m = cell.match(DATE_RE);
      if (m) {
        dateCols[c] = toDate(parseInt(m[1], 10), parseInt(m[2], 10), ref);
        hasDate = true;
      }
    }
    if (hasDate) {
      currentCols = dateCols;
      // 先在 schedule 建立這些日期的空殼
      for (const c of Object.keys(dateCols)) {
        const d = dateCols[c];
        const k = dateKey(d);
        if (!schedule.has(k)) schedule.set(k, { date: d, statuses: {} });
      }
      continue;
    }

    // 不是日期列：看 A 欄是不是已知成員
    const name = String(row[0] ?? '').trim();
    if (currentCols && KNOWN_NAMES.has(name)) {
      for (const cStr of Object.keys(currentCols)) {
        const c = Number(cStr);
        const d = currentCols[c];
        const k = dateKey(d);
        // 尾端空白格會被 API 裁掉 → row[c] 可能 undefined，一律視為空白
        const status = String(row[c] ?? '').trim();
        schedule.get(k).statuses[name] = status;
      }
    }
  }

  return schedule;
}

/** 某狀態是否算「已填」(O / X / △ 都算填了；空白才是沒填) */
function isFilled(status) {
  return status !== undefined && status !== null && String(status).trim() !== '';
}

/**
 * 查指定日期區間內「沒填完」的人。
 * @param {Map} schedule  parseSchedule 的結果
 * @param {Date} from     起始 (含)
 * @param {Date} to       結束 (含)
 * @param {string[]} [names] 只查這些成員(試算表名字)；省略則查全部
 * @returns {{
 *   dates: {dateStr:string,date:Date}[],          // 區間內表上實際存在的日期
 *   perMember: { [name:string]: string[] },        // 每個人缺填的日期清單(空陣列=全填了)
 *   incompleteMembers: string[]                    // 有缺填的人
 * }}
 */
function findUnfilled(schedule, from, to, names) {
  const targetNames = names && names.length ? names : MEMBERS.map(m => m.sheetName);

  const fromMid = new Date(from); fromMid.setHours(0, 0, 0, 0);
  const toMid = new Date(to); toMid.setHours(23, 59, 59, 999);

  // 區間內、表上存在的日期，依時間排序
  const dates = [...schedule.values()]
    .filter(e => e.date >= fromMid && e.date <= toMid)
    .sort((a, b) => a.date - b.date)
    .map(e => ({ dateStr: dateKey(e.date), date: e.date, entry: e }));

  const perMember = {};
  for (const name of targetNames) perMember[name] = [];

  for (const { dateStr, entry } of dates) {
    for (const name of targetNames) {
      const status = entry.statuses[name]; // 沒這格 → undefined → 視為沒填
      if (!isFilled(status)) perMember[name].push(dateStr);
    }
  }

  const incompleteMembers = targetNames.filter(n => perMember[n].length > 0);
  return { dates: dates.map(d => ({ dateStr: d.dateStr, date: d.date })), perMember, incompleteMembers };
}

/**
 * 找出區間內「全員皆 O」的出團日（湊滿 8 人）。
 * 規則：當天 8 位成員的狀態全部都是 'O' 才算；X / △ / 空白 都不算。
 * @returns {{dateStr:string,date:Date}[]} 依時間排序
 */
function fullAvailableDates(schedule, from, to) {
  const fromMid = new Date(from); fromMid.setHours(0, 0, 0, 0);
  const toMid = new Date(to); toMid.setHours(23, 59, 59, 999);
  const names = MEMBERS.map(m => m.sheetName);

  return [...schedule.values()]
    .filter(e => e.date >= fromMid && e.date <= toMid)
    .filter(e => names.every(n => String(e.statuses[n] ?? '').trim() === 'O'))
    .sort((a, b) => a.date - b.date)
    .map(e => ({ dateStr: dateKey(e.date), date: e.date }));
}

/** 算出「下一個 CD 週」的區間 (以週二為第一天，週二~下週一)。給週六催填、週日公告用。 */
function nextCdWeek(ref = new Date()) {
  const d = new Date(ref); d.setHours(0, 0, 0, 0);
  // getDay(): 0=日 1=一 2=二 ... 6=六。要找「之後的下一個週二」。
  let offset = (2 - d.getDay() + 7) % 7;
  if (offset === 0) offset = 7; // 今天剛好週二 → 取下一個週二
  const start = new Date(d); start.setDate(d.getDate() + offset);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  return { start, end };
}

module.exports = {
  SHEET_NAME,
  fetchGrid,
  parseSchedule,
  findUnfilled,
  fullAvailableDates,
  nextCdWeek,
  isFilled,
  dateKey,
  toDate,
  // 高階便利函式：直接讀表 + 解析
  async loadSchedule(ref = new Date()) {
    const grid = await fetchGrid();
    return parseSchedule(grid, ref);
  },
};
