// ────────────────────────────────────────────────────────────────
//  拓荒筆記 Firestore 存取層
//
//  集合：note（欄位 schema 與 Firestore console 上既有文件一致）
//    userId      : string    Discord 使用者 ID
//    phase       : number    拓荒 phase
//    noteContent : string    筆記內容（≤1000 字，含換行）
//    createTime  : Timestamp 建立時間
//
//  下一階段 RAG 會直接在同一 document 加 embedding 欄位
//  （FieldValue.vector）+ embeddingModel + embeddedAt，不需要遷移。
//
//  查詢刻意避免複合索引：
//    - phase 查詢只用單一等值 where，排序在記憶體做
//    - date 查詢是同欄位 range + orderBy，自動索引即可
// ────────────────────────────────────────────────────────────────

const fs = require('fs');
const { Firestore, Timestamp } = require('@google-cloud/firestore');
const { toDate } = require('./scheduleGridService');

// 本機有 credentials.json 就用它；雲端(Cloud Run)沒有檔案時改用 ADC(執行身分的服務帳號)。
// 注意：Firestore 資料庫在另一個專案 discordbot-59caf（不是 Cloud Run 所在的 discorddatebot），
// 所以必須用 FIRESTORE_PROJECT_ID 指定專案，服務帳號已在該專案授權 datastore.user。
const opts = {
  // Cloud Run 不支援 IPv6 出站，gRPC 解析到 IPv6 位址會卡到逾時（LB pick 60s+）。
  // 改走 REST 傳輸避開 gRPC，也順便加快冷啟動。我們只用讀寫、不用即時監聽，REST 夠用。
  preferRest: true,
};
if (fs.existsSync('./credentials.json')) opts.keyFilename = './credentials.json';
if (process.env.FIRESTORE_PROJECT_ID) opts.projectId = process.env.FIRESTORE_PROJECT_ID;
const db = new Firestore(opts); // (default) database — 只有它有免費額度
const noteCol = db.collection('note');

/**
 * 新增一則筆記。
 * @param {{userId: string, phase: number, noteContent: string}} note
 * @returns {Promise<string>} 新文件的 id
 */
async function addNote({ userId, phase, noteContent }) {
  const ref = await noteCol.add({
    userId,
    phase,
    noteContent,
    createTime: Timestamp.now(),
  });
  return ref.id;
}

function toRecord(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    userId: d.userId,
    phase: d.phase,
    noteContent: d.noteContent,
    createTime: d.createTime, // Firestore Timestamp
  };
}

/**
 * 依 phase 查筆記，依 createTime 升冪回傳。
 * 排序在記憶體做（資料量小），避免 phase+createTime 複合索引。
 */
async function searchByPhase(phase, { limit = 50 } = {}) {
  const snap = await noteCol.where('phase', '==', phase).limit(limit).get();
  return snap.docs
    .map(toRecord)
    .sort((a, b) => a.createTime.toMillis() - b.createTime.toMillis());
}

/**
 * 台北時區某天的 [起, 迄) UTC 邊界。台北 00:00 = UTC 前一日 16:00。
 * 不依賴伺服器時區（Cloud Run 是 UTC）。
 */
function taipeiDayRange(month, day, ref = new Date()) {
  const d = toDate(month, day, ref); // 跨年推算沿用出團時間表的邏輯
  const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - 8 * 3600 * 1000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

/**
 * 查「台北時間 M/D 當天」建立的筆記，依 createTime 升冪回傳。
 */
async function searchByDate(month, day, { limit = 50 } = {}) {
  const { start, end } = taipeiDayRange(month, day);
  const snap = await noteCol
    .where('createTime', '>=', start)
    .where('createTime', '<', end)
    .orderBy('createTime')
    .limit(limit)
    .get();
  return snap.docs.map(toRecord);
}

module.exports = { addNote, searchByPhase, searchByDate, taipeiDayRange };
