async function reminder(req, res) {
  console.log('[CRON] 收到週五催填排程指令...');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`;

  const payload = {
    content:
      '**記得填寫時間表！**\n' +
      '請記得上去填寫下一週的可出席時間，三角形者請務必於備註說明最快可確任時間，若已填寫完成請無視本訊息。\n' +
      `傳送門：<${sheetUrl}>`
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('週五催填公告發送成功！');
      return res.status(200).send('Reminder sent');
    } else {
      throw new Error(await response.text());
    }
  } catch (error) {
    console.error('週五催填發送失敗：', error.message);
    return res.status(500).send('Failed to send reminder');
  }
}

module.exports = reminder;
