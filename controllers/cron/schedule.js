const { loadSchedule, fullAvailableDates, nextCdWeek } = require('../../services/scheduleGridService');

async function schedule(req, res) {
  console.log('[CRON] 收到週日出團公告排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  try {
    // 下一週 CD 週期 = 今天之後的下一個週二起算的那一週（週二 ~ 下週一）
    const today = new Date();
    const { start, end } = nextCdWeek(today);

    // 直接從「出團時間表」O/X/△ 格子算出「全員皆 O」的出團日
    const schedule = await loadSchedule(today);
    const thisWeekRaidDates = fullAvailableDates(schedule, start, end).map(d => d.dateStr);

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
    announceMessage +=
      '---------------------------------------\n' +
      '如有臨時請假，請務必提早於群組通知！';

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: announceMessage }),
    });

    console.log('週日出團公告發送成功！');
    return res.status(200).send('Schedule announced');
  } catch (error) {
    console.error('週日出團公告發送失敗：', error.message);
    return res.status(500).send('Failed to send schedule');
  }
}

module.exports = schedule;
