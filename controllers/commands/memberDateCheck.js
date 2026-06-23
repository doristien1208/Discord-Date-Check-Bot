const { InteractionResponseType } = require('discord-interactions');
const { loadSchedule, findUnfilled } = require('../../services/scheduleGridService');
const { resolveTarget, bySheetName, mention } = require('../../config/members');

const WINDOW_DAYS = 14; // /memberdatecheck all 查「今天起未來 14 天」

/**
 * /memberdatecheck <target>
 *   target = all          → 未來 14 天內，誰還沒把表填完
 *   target = @某人/ID/名字 → 查該成員未來 14 天缺填的日期
 */
async function handleMemberDateCheck(interaction, res) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  // 先回 defer，爭取最多 15 分鐘去查表
  // flags: 64 = EPHEMERAL，私密狀態會被後續 PATCH 繼承，所以只有自己看得到
  res.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  });

  const rawInput = interaction.data?.options?.[0]?.value ?? '';
  const target = resolveTarget(rawInput);

  let content;
  try {
    if (target.type === 'unknown') {
      content = `找不到對應的成員「${target.input}」。請輸入 \`all\`、或用 @ 標記成員、或輸入表上的名字。`;
    } else {
      const now = new Date();
      const from = new Date(now); from.setHours(0, 0, 0, 0);
      const to = new Date(now); to.setDate(now.getDate() + WINDOW_DAYS); to.setHours(23, 59, 59, 999);

      const schedule = await loadSchedule(now);

      if (target.type === 'all') {
        content = formatAll(findUnfilled(schedule, from, to), WINDOW_DAYS);
      } else {
        const m = target.member;
        const result = findUnfilled(schedule, from, to, [m.sheetName]);
        content = formatOne(m, result, WINDOW_DAYS);
      }
    }
  } catch (error) {
    console.error('[INTERACTION] 執行 /memberdatecheck 時發生錯誤：', error);
    content = '去查表的時候出錯了，請稍後再試或檢查表單權限。';
  }

  await fetch(patchUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: ['users'] } }),
  });
}

function rangeLabel(dates, windowDays) {
  if (!dates.length) return `未來 ${windowDays} 天`;
  return `${dates[0].dateStr} ～ ${dates[dates.length - 1].dateStr}`;
}

function formatAll(result, windowDays) {
  const { dates, perMember, incompleteMembers } = result;
  if (!dates.length) {
    return `表上未來 ${windowDays} 天還沒有任何日期，可能下一週的表還沒建立。`;
  }
  let msg = `**未來 ${windowDays} 天填表進度** (${rangeLabel(dates, windowDays)})\n`;
  msg += '---------------------------------------\n';
  if (incompleteMembers.length === 0) {
    msg += '太棒了，所有人都填完了！';
    return msg;
  }
  msg += '以下成員還沒填完：\n';
  for (const name of incompleteMembers) {
    const m = bySheetName(name);
    const missing = perMember[name];
    msg += `${mention(m)}　缺：${missing.join('、')}\n`;
  }
  msg += '---------------------------------------\n請儘快上去補完～';
  return msg;
}

function formatOne(member, result, windowDays) {
  const { dates, perMember } = result;
  const missing = perMember[member.sheetName] || [];
  if (!dates.length) {
    return `表上未來 ${windowDays} 天還沒有任何日期。`;
  }
  if (missing.length === 0) {
    return `${mention(member)} 在 ${rangeLabel(dates, windowDays)} 內已經全部填完了！`;
  }
  return `${mention(member)} 在 ${rangeLabel(dates, windowDays)} 內還沒填：\n${missing.join('、')}`;
}

module.exports = handleMemberDateCheck;
