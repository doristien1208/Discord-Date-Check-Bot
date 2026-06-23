const { InteractionResponseType } = require('discord-interactions');
const { getRaidDates } = require('../../services/sheetService');

async function handleAsk(interaction, res) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const patchUrl = `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`;

  // 1. 先回應 Discord，保證在 3 秒內送出，爭取最多 15 分鐘的處理時間
  res.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

  try {
    const userQuestion = interaction.data.options[0].value;

    // 2. 背景去慢慢查表單
    console.log('[INTERACTION] 已發送思考中狀態，開始呼叫 Google Sheets API...');
    const schedule = await getRaidDates();
    console.log('[INTERACTION] Google Sheets API 查詢完成！準備更新訊息...');

    // 3. 查完之後，透過 Discord REST API 編輯剛剛那個思考中的訊息
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `你問了：「${userQuestion}」\n\n這是我去查表單的結果：\n${schedule}`
      })
    });
  } catch (error) {
    console.error('[INTERACTION] 執行 /ask 時發生錯誤：', error);

    // 如果報錯了，也要記得更新訊息，不然頻道會一直卡在思考中
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '腦袋當機了，去查表單的時候摔了一跤...' })
    });
  }
}

module.exports = handleAsk;
