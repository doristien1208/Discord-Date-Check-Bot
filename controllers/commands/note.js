const { InteractionType, InteractionResponseType } = require('discord-interactions');
const { addNote, searchByPhase, searchByDate, taipeiDayRange } = require('../../services/noteService');
const { byDiscordId } = require('../../config/members');

// /note 是複合(父)指令：
//   add    → 回 Modal 讓使用者輸入 phase + 多行內容，送出後寫入 Firestore
//   search → 依 phase 或 date(M/D) 查詢，結果私密顯示
//
// Modal custom_id。未來若有其他 Modal，依「<指令>_<動作>_modal」慣例命名。
const NOTE_ADD_MODAL_ID = 'note_add_modal';

const MAX_CONTENT_LEN = 1000;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})$/;

async function handleNote(interaction, res) {
  const sub = interaction.data?.options?.[0]?.name;

  if (sub === 'add') return handleAdd(interaction, res);
  if (sub === 'search') return handleSearch(interaction, res);

  return res.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: `尚未支援的子指令：${sub ?? '(無)'}`, flags: 64 },
  });
}

// /note add — 回 Modal（必須是第一個回應，不能 defer；這裡沒有 I/O 所以沒有 3 秒風險）
function handleAdd(interaction, res) {
  return res.json({
    type: InteractionResponseType.MODAL, // 9
    data: {
      custom_id: NOTE_ADD_MODAL_ID,
      title: '新增拓荒筆記',
      // discord-interactions 沒有 component 常數，只能用數字：
      //   type 1 = ACTION_ROW, type 4 = TEXT_INPUT, style 1 = Short, style 2 = Paragraph
      components: [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'phase',
            style: 1,
            label: 'Phase（數字，例如 3）',
            required: true,
            max_length: 3,
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'content',
            style: 2, // Paragraph = 多行輸入
            label: `筆記內容（最多 ${MAX_CONTENT_LEN} 字）`,
            required: true,
            max_length: MAX_CONTENT_LEN,
            placeholder: '機制重點、站位、發現的問題……可換行',
          }],
        },
      ],
    },
  });
}

// Modal 送出（InteractionType.MODAL_SUBMIT）— 驗證後寫入 Firestore
async function handleNoteModalSubmit(interaction, res) {
  // 攤平 Modal 欄位：data.components[] 是 action row，row.components[0] 是 text input
  const fields = {};
  for (const row of interaction.data?.components ?? []) {
    for (const c of row.components ?? []) fields[c.custom_id] = c.value;
  }

  const phaseRaw = String(fields.phase ?? '').trim();
  const content = String(fields.content ?? '').replace(/\r\n/g, '\n').trim();

  // 同步驗證失敗 → 直接回覆（不 defer）。Modal 內容送出後就消失了，要明確告知需要重打。
  if (!/^\d+$/.test(phaseRaw) || parseInt(phaseRaw, 10) < 1) {
    return res.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Phase 必須是正整數（你輸入的是「${phaseRaw}」），筆記沒有存檔，請重新輸入一次。`, flags: 64 },
    });
  }
  if (!content || content.length > MAX_CONTENT_LEN) {
    return res.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `筆記內容不能是空白、且最多 ${MAX_CONTENT_LEN} 字，請重新輸入一次。`, flags: 64 },
    });
  }

  const phase = parseInt(phaseRaw, 10);
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? '';

  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  // Firestore 首次連線 + 冷啟動可能超過 3 秒 → 先 defer 再 PATCH
  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  });

  try {
    console.log(`[INTERACTION] /note add：寫入 Firestore（P${phase}, ${content.length} 字）...`);
    await addNote({ userId, phase, noteContent: content });
    console.log('[INTERACTION] /note add：寫入完成');

    const preview = content.length > 100 ? `${content.slice(0, 100)}…` : content;
    await patchOriginal(patchUrl, `已記下 **P${phase}** 筆記！\n>>> ${preview}`);
  } catch (error) {
    console.error('[INTERACTION] 執行 /note add 時發生錯誤：', error);
    await patchOriginal(patchUrl, '存筆記的時候出錯了，請稍後再試。');
  }
}

// /note search — 依 phase 或 date 查詢
async function handleSearch(interaction, res) {
  const opts = interaction.data?.options?.[0]?.options ?? [];
  const phaseOpt = opts.find(o => o.name === 'phase')?.value;
  const dateOpt = opts.find(o => o.name === 'date')?.value;

  // 同步驗證（在 defer 之前，錯誤直接回覆）
  if (phaseOpt == null && !dateOpt) {
    return res.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '請至少填一個查詢條件：`phase`（例如 3）或 `date`（例如 6/23）。', flags: 64 },
    });
  }
  let dateMD = null;
  if (dateOpt) {
    const m = String(dateOpt).trim().match(DATE_RE);
    const month = m ? parseInt(m[1], 10) : 0;
    const day = m ? parseInt(m[2], 10) : 0;
    if (!m || month < 1 || month > 12 || day < 1 || day > 31) {
      return res.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `日期格式不對（你輸入的是「${dateOpt}」），請用 M/D，例如 6/23。`, flags: 64 },
      });
    }
    dateMD = { month, day };
  }

  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  });

  try {
    console.log(`[INTERACTION] /note search：phase=${phaseOpt ?? '-'} date=${dateOpt ?? '-'}，查詢 Firestore...`);
    let notes;
    let title;
    if (phaseOpt != null) {
      notes = await searchByPhase(phaseOpt);
      title = `P${phaseOpt}`;
      // phase + date 同時填：date 在記憶體過濾，避免複合索引
      if (dateMD) {
        const { start, end } = taipeiDayRange(dateMD.month, dateMD.day);
        notes = notes.filter(n => {
          const t = n.createTime.toDate();
          return t >= start && t < end;
        });
        title += ` × ${dateMD.month}/${dateMD.day}`;
      }
    } else {
      notes = await searchByDate(dateMD.month, dateMD.day);
      title = `${dateMD.month}/${dateMD.day}`;
    }
    console.log(`[INTERACTION] /note search：查到 ${notes.length} 則`);

    await patchOriginal(patchUrl, formatSearchResult(title, notes));
  } catch (error) {
    console.error('[INTERACTION] 執行 /note search 時發生錯誤：', error);
    await patchOriginal(patchUrl, '查筆記的時候出錯了，請稍後再試。');
  }
}

function displayName(userId) {
  const m = byDiscordId(userId);
  return m ? m.sheetName : `<@${userId}>`;
}

function formatTime(ts) {
  return ts.toDate().toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Discord 訊息上限 2000 字 → 累加到 ~1900 就截斷
function formatSearchResult(title, notes) {
  if (!notes.length) return `**【筆記查詢】${title}**\n找不到符合的筆記。`;

  const header = `**【筆記查詢】${title}**（共 ${notes.length} 則）\n`;
  let msg = header;
  let shown = 0;
  for (const n of notes) {
    const block = `─ ${formatTime(n.createTime)} ${displayName(n.userId)}\n${n.noteContent}\n`;
    if (msg.length + block.length > 1900) break;
    msg += block;
    shown++;
  }
  if (shown < notes.length) {
    msg += `……內容太多，僅顯示前 ${shown} 則（共 ${notes.length} 則）`;
  }
  return msg;
}

async function patchOriginal(patchUrl, content) {
  await fetch(patchUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

module.exports = { handleNote, handleNoteModalSubmit, NOTE_ADD_MODAL_ID };
