const { loadSchedule, fullAvailableDates, currentCdWeek } = require('../../services/scheduleGridService');

async function mondaySchedule(req, res) {
  console.log('[CRON] 收到週一出團公告排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  try {
    // 本週 CD 週期 = 今天所屬的那一週（週二 ~ 下週一），不會跨到下一個區塊
    const today = new Date();
    const { start, end } = currentCdWeek(today);

    // 直接從「出團時間表」O/X/△ 格子算出「全員皆 O」的出團日
    const schedule = await loadSchedule(today);
    const thisWeekRaidDates = fullAvailableDates(schedule, start, end).map(d => d.dateStr);

    let announceMessage = '**【本週出團時間表】**\n';
    announceMessage += `本週 CD 週期：${start.getMonth() + 1}/${start.getDate()} (二) ～ ${end.getMonth() + 1}/${end.getDate()} (一)\n`;
    announceMessage += '---------------------------------------\n';

    if (thisWeekRaidDates.length === 0) {
      announceMessage += '本週一天都沒有湊齊！大家可以放假去打野團或休息了！\n';
    } else {
      announceMessage += '本週預計出團日如下（請於21:00準時出沒）：\n';
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

    console.log('週一出團公告發送成功！');
    return res.status(200).send('Schedule announced');
  } catch (error) {
    console.error('週一出團公告發送失敗：', error.message);
    return res.status(500).send('Failed to send schedule');
  }
}

module.exports = mondaySchedule;
