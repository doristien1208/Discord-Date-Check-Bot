const { InteractionResponseType } = require('discord-interactions');
const { loadSchedule, dateKey, dateLabel } = require('../../services/scheduleGridService');
const { MEMBERS } = require('../../config/members');

// /today — 檢查「今天」是否出團（全員皆 O 才算出團日），並帶上星期。
async function handleToday(interaction, res) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  // 先回 defer（私密），爭取時間去讀表
  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  });

  let content;
  try {
    const now = new Date();
    const label = dateLabel(now); // 例如 "6/29 (一)"
    const schedule = await loadSchedule(now);
    const entry = schedule.get(dateKey(now));

    if (!entry) {
      content = `**今天出團檢查**　${label}\n今天不在時間表上（可能該週還沒建立）。`;
    } else {
      const unavailable = []; // X
      const tentative = [];   // △
      const unfilled = [];    // 空白
      let allO = true;

      for (const name of MEMBERS.map(m => m.sheetName)) {
        const s = String(entry.statuses[name] ?? '').trim();
        if (s === 'O') continue;
        allO = false;
        if (s === 'X') unavailable.push(name);
        else if (s === '△') tentative.push(name);
        else unfilled.push(name);
      }

      if (allO) {
        content = `**今天出團檢查**　${label}\n今天有出團！全員到齊（8 人皆 O）。`;
      } else {
        content = `**今天出團檢查**　${label}\n今天不出團。\n`;
        if (unavailable.length) content += `不行：${unavailable.join('、')}\n`;
        if (tentative.length) content += `待定：${tentative.join('、')}\n`;
        if (unfilled.length) content += `未填：${unfilled.join('、')}\n`;
        content = content.trimEnd();
      }
    }
  } catch (error) {
    console.error('[INTERACTION] 執行 /today 時發生錯誤：', error);
    content = '查詢今天出團狀況時出錯了，請稍後再試。';
  }

  await fetch(patchUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

module.exports = handleToday;
