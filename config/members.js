// ────────────────────────────────────────────────────────────────
//  成員名單 — 單一來源對照表 (sheetName ↔ Discord ID)
//
//  ID 先放佔位字串，請之後把 'PLACEHOLDER_xxx' 換成真正的 Discord 使用者 ID。
//     取得方式：Discord 開「開發者模式」後，對該成員頭像 → 右鍵 → 複製使用者 ID。
//
//  sheetName 必須和「出團時間表」A 欄裡的名字「完全一致」(含大小寫、中英)。
// ────────────────────────────────────────────────────────────────

const MEMBERS = [
  { sheetName: 'TL',        discordId: '310410415459008513' },
  { sheetName: '羊駝',      discordId: '168681383110115329' },
  { sheetName: 'Feishan',   discordId: '264710198420176897' },
  { sheetName: '壞松鼠學者', discordId: '381724140249546752' },
  { sheetName: '逗點',      discordId: '498534506140139520' },
  { sheetName: 'Iori',      discordId: '239049756104589312' },
  { sheetName: '海豹',      discordId: '436475518720802827' },
  { sheetName: '卷卷',      discordId: '653981008529719346' },
];

/** 依 Discord ID 找成員 */
function byDiscordId(id) {
  return MEMBERS.find(m => m.discordId === id);
}

/** 依試算表名字找成員 */
function bySheetName(name) {
  if (!name) return undefined;
  const target = String(name).trim();
  return MEMBERS.find(m => m.sheetName === target);
}

/** 寬鬆解析使用者輸入：可接受 all / <@123> / 純數字 ID / 試算表名字 */
function resolveTarget(input) {
  if (!input) return { type: 'none' };
  const raw = String(input).trim();
  if (raw.toLowerCase() === 'all') return { type: 'all' };

  // <@123456> 或 <@!123456> 形式 → 取出數字 ID
  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  const id = mentionMatch ? mentionMatch[1] : (/^\d+$/.test(raw) ? raw : null);

  if (id) {
    const m = byDiscordId(id);
    return m ? { type: 'member', member: m } : { type: 'unknown', input: raw };
  }

  // 當成試算表名字查
  const m = bySheetName(raw);
  return m ? { type: 'member', member: m } : { type: 'unknown', input: raw };
}

/**
 * 產生可在 Discord 訊息中 @ 標記的字串。
 * 若 ID 還是佔位字串，退回顯示名字 (前面加 @ 但不會真的 tag)，避免訊息壞掉。
 */
function mention(member) {
  if (!member) return '';
  if (member.discordId && !member.discordId.startsWith('PLACEHOLDER')) {
    return `<@${member.discordId}>`;
  }
  return `@${member.sheetName}`;
}

module.exports = { MEMBERS, byDiscordId, bySheetName, resolveTarget, mention };
