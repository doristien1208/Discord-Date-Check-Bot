async function sundayReminder(req, res) {
  console.log('⏰ [CRON] 收到週日催填排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`;

  const payload = {
    content:
      '📢 **光之戰士們！填寫時間囉！**\n' +
      '請記得上去填寫下一週（週二起算）的絕境戰可出團時間喔！\n' +
      `⚔️ 傳送門：<${sheetUrl}> \n` +
      '@everyone 記得設定鬧鐘不要忘記啦！'
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ 週日催填公告發送成功！');
      return res.status(200).send('Reminder sent');
    } else {
      throw new Error(await response.text());
    }
  } catch (error) {
    console.error('❌ 週日催填發送失敗：', error.message);
    return res.status(500).send('Failed to send reminder');
  }
}

module.exports = sundayReminder;
