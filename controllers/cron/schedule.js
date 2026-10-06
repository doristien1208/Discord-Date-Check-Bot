const { loadSchedule, fullAvailableDates, findTentative, nextCdWeek, dateLabel, weekUrl } = require('../../services/scheduleGridService');
const { bySheetName, mention } = require('../../config/members');

async function schedule(req, res) {
  console.log('[CRON] 收到週日出團公告排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  try {
    // 下一週 CD 週期 = 今天之後的下一個週二起算的那一週（週二 ~ 下週一）
    const today = new Date();
    const { start, end } = nextCdWeek(today);

    // 直接從「出團時間表」O/X/△ 格子算出「全員皆 O」的出團日
    const schedule = await loadSchedule(today);
    const thisWeekRaidDates = fullAvailableDates(schedule, start, end).map(d => dateLabel(d.date));

    // 沒有人 X、但有人 △ 的日子：只差 △ 的人確認就可能出團
    const tentative = findTentative(schedule, start, end);

    let announceMessage = '**【下一週出團時間表】**\n';
    announceMessage += `下一週 CD 週期：${start.getMonth() + 1}/${start.getDate()} (二) ～ ${end.getMonth() + 1}/${end.getDate()} (一)\n`;
    announceMessage += '---------------------------------------\n';

    if (thisWeekRaidDates.length === 0) {
      announceMessage += '下一週沒有湊齊8人的天數，休團一週\n';
    } else {
      announceMessage += '下一週預計出團日如下（請於21:00準時出沒Elemental）：\n';
      thisWeekRaidDates.forEach(date => {
        announceMessage += `**${date}**\n`;
      });
    }

    if (tentative.members.length) {
      announceMessage +=
        '---------------------------------------\n' +
        '**以下日期只差 △ 確認就可能出團，出團日可能會再變動**\n' +
        '請以下成員盡快確認三角形那幾天是否可以出團，並更新時間表：\n';
      for (const name of tentative.members) {
        announceMessage += `${mention(bySheetName(name))}　待確認：${tentative.perMember[name].join('、')}\n`;
      }
      announceMessage += `傳送門：[點我直接前往下一週](<${await weekUrl(schedule, start, end)}>)\n`;
    }

    announceMessage +=
      '---------------------------------------\n' +
      '如有臨時請假，請務必提早於群組通知！';

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: announceMessage, allowed_mentions: { parse: ['users'] } }),
    });

    console.log('週日出團公告發送成功！');
    return res.status(200).send('Schedule announced');
  } catch (error) {
    console.error('週日出團公告發送失敗：', error.message);
    return res.status(500).send('Failed to send schedule');
  }
}

module.exports = schedule;
