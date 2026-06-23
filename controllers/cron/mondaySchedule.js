const { getRaidDates } = require('../../services/sheetService');

async function mondaySchedule(req, res) {
  console.log('[CRON] 收到週一出團公告排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  try {
    // 去 Google Sheet 抓 A 列所有日期（例如：" 接下來有湊滿 8 人的出團日期為：6/23, 6/24"）
    const rawDates = await getRaidDates();

    // 切出純日期部分
    const datePart = rawDates.includes('：') ? rawDates.split('：')[1] : rawDates;

    if (!datePart || datePart.includes('目前沒有')) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '**每週出團公告**：目前排班表上沒有任何全員到齊的時間！' })
      });
      return res.status(200).send('No dates found');
    }

    // 把 "6/23, 6/24" 變成 ['6/23', '6/24']
    const dateArray = datePart.split(',').map(d => d.trim());

    // FF14 的週更新（週二到下週一）
    // 找出「明天（週二）開始的未來 7 天內」有哪些日子要出團
    const today = new Date();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const nextMonday = new Date(tomorrow);
    nextMonday.setDate(tomorrow.getDate() + 6);
    nextMonday.setHours(23, 59, 59, 999);

    const currentYear = today.getFullYear();

    const thisWeekRaidDates = dateArray.filter(dateStr => {
      const [month, day] = dateStr.split('/');
      const targetDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));
      return targetDate >= tomorrow && targetDate <= nextMonday;
    });

    let announceMessage = ' **【本週出團時間表】** \n';
    announceMessage += `本週 CD 週期：${tomorrow.getMonth() + 1}/${tomorrow.getDate()} (二) ～ ${nextMonday.getMonth() + 1}/${nextMonday.getDate()} (一)\n`;
    announceMessage += '---------------------------------------\n';

    if (thisWeekRaidDates.length === 0) {
      announceMessage += ' 本週一天都沒有湊齊！大家可以放假去打野團或休息了！\n';
    } else {
      announceMessage += ' 本週預計出團日如下（請於21:00準時出沒）：\n';
      thisWeekRaidDates.forEach(date => {
        announceMessage += `**${date}** \n`;
      });
    }
    announceMessage +=
      '---------------------------------------\n' +
      '如有臨時請假，請務必提早於群組通知！';

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: announceMessage })
    });

    console.log('週一出團公告發送成功！');
    return res.status(200).send('Schedule announced');
  } catch (error) {
    console.error('週一出團公告發送失敗：', error.message);
    return res.status(500).send('Failed to send schedule');
  }
}

module.exports = mondaySchedule;
