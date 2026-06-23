const { loadSchedule, findUnfilled, nextCdWeek } = require('../../services/scheduleGridService');
const { bySheetName, mention } = require('../../config/members');

/**
 * 週六中午催填：檢查「下一個 CD 週」(下週二 ~ 下週一) 還沒填完的人，
 * 並 @ 標記他們發到 Discord webhook。
 * 由外部排程器 (Render Cron / cron-job.org 等) 以 POST 觸發。
 *   建議 cron：0 12 * * 6 （注意伺服器時區，台灣時間需設 UTC 04:00 → 0 4 * * 6）
 */
async function saturdayUnfilled(req, res) {
  console.log('[CRON] 收到週六催填排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`;

  try {
    const now = new Date();
    const { start, end } = nextCdWeek(now);
    const schedule = await loadSchedule(now);
    const { dates, perMember, incompleteMembers } = findUnfilled(schedule, start, end);

    let content;
    if (!dates.length) {
      content =
        '**填表提醒**\n' +
        `下一週 CD（${start.getMonth() + 1}/${start.getDate()} 起）的表好像還沒建立喔，請先把日期排好！\n` +
        `傳送門：<${sheetUrl}>`;
    } else if (incompleteMembers.length === 0) {
      content =
        '**填表進度確認**\n' +
        `下一週 CD（${dates[0].dateStr} ～ ${dates[dates.length - 1].dateStr}）全員都填完了，明天就能順利統計天數！`;
    } else {
      content =
        '**填表催繳！** 明天（週日）就要統計天數囉\n' +
        `下一週 CD：${dates[0].dateStr} ～ ${dates[dates.length - 1].dateStr}\n` +
        '---------------------------------------\n' +
        '以下這些人還沒填完，麻煩盡快補上：\n';
      for (const name of incompleteMembers) {
        const m = bySheetName(name);
        content += `${mention(m)}　缺：${perMember[name].join('、')}\n`;
      }
      content +=
        '---------------------------------------\n' +
        `傳送門：<${sheetUrl}>`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: ['users'] } }),
    });

    if (!response.ok) throw new Error(await response.text());
    console.log('週六催填發送成功！');
    return res.status(200).send('Saturday reminder sent');
  } catch (error) {
    console.error('週六催填發送失敗：', error.message);
    return res.status(500).send('Failed to send saturday reminder');
  }
}

module.exports = saturdayUnfilled;
