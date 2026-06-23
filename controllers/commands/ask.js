const { InteractionResponseType } = require('discord-interactions');
const { getUpcomingRaidDates, getProgress } = require('../../services/sheetService');

// /ask 是複合(父)指令，依子指令分流。未來要擴充新功能就在這裡加一個子指令分支。
// 目前支援的子指令：
//   datecheck → 查未來出團時間（讀「當前總時數計算」A 欄）
//   tour      → 拓荒進度統計（讀「當前總時數計算」整張表）
async function handleAsk(interaction, res) {
  const sub = interaction.data?.options?.[0]?.name;

  if (sub === 'datecheck') return handleDatecheck(interaction, res);
  if (sub === 'tour') return handleTour(interaction, res);

  // 未知 / 尚未實作的子指令
  return res.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: `尚未支援的子指令：${sub ?? '(無)'}`, flags: 64 },
  });
}

// /ask datecheck — 查未來出團時間
async function handleDatecheck(interaction, res) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  // 先回 defer（私密），爭取最多 15 分鐘去查表
  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  });

  try {
    console.log('[INTERACTION] /ask datecheck：開始呼叫 Google Sheets API...');
    const dates = await getUpcomingRaidDates(new Date());
    console.log('[INTERACTION] /ask datecheck：查詢完成，更新訊息...');

    const content = dates.length
      ? `接下來的出團日期為：${dates.join('、')}`
      : '目前表上沒有今天以後的出團日期喔！';

    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (error) {
    console.error('[INTERACTION] 執行 /ask datecheck 時發生錯誤：', error);
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '去查表單的時候出錯了，請稍後再試。' }),
    });
  }
}

// /ask tour — 拓荒進度統計
async function handleTour(interaction, res) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  });

  try {
    console.log('[INTERACTION] /ask tour：開始計算拓荒進度...');
    const p = await getProgress(new Date());
    console.log('[INTERACTION] /ask tour：計算完成，更新訊息...');

    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: formatTour(p) }),
    });
  } catch (error) {
    console.error('[INTERACTION] 執行 /ask tour 時發生錯誤：', error);
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '計算進度時出錯了，請稍後再試。' }),
    });
  }
}

function formatTour(p) {
  if (!p.count) return '目前還沒有任何練團紀錄喔！';

  const lines = ['**【拓荒進度】**'];

  // 目前最遠進度
  if (p.furthest == null) {
    lines.push('目前最遠：尚無 phase 進度紀錄');
  } else if (p.cleared) {
    lines.push(`目前最遠：P${p.furthest}（已清本！）`);
  } else {
    const hp = p.bestHp != null ? `（最佳剩血 ${p.bestHp}%）` : '';
    lines.push(`目前最遠：P${p.furthest}${hp}`);
  }

  // 累計
  let acc = `累計：${p.totalHours} hr`;
  if (p.totalPulls > 0) acc += ` / ${p.totalPulls} 把`;
  if (p.avgMinPerPull != null) acc += ` / 平均每把約 ${p.avgMinPerPull.toFixed(1)} 分`;
  lines.push(acc);

  // 進度時間軸
  if (p.timeline.length) {
    lines.push('進度時間軸：' + p.timeline.map(t => `P${t.phase} ${t.dateStr}`).join(' → '));
  }

  // 卡關
  if (p.stuck && !p.cleared) {
    lines.push(`卡 P${p.furthest}：自 ${p.stuck.sinceStr} 起 ${p.stuck.days} 天 / ${p.stuck.pulls} 把尚未突破`);
  }

  return lines.join('\n');
}

module.exports = handleAsk;
