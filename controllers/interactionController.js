const { InteractionType, InteractionResponseType } = require('discord-interactions');
const handleAsk = require('./commands/ask');
const handleNote = require('./commands/note');
const handleMemberDateCheck = require('./commands/memberDateCheck');

async function handleInteraction(req, res) {
  const interaction = req.body;
  console.log(`[INTERACTION] 簽章驗證通過！Type = ${interaction.type}`);

  // Type 1：Ping（Discord 綁定 URL 時發送）
  if (interaction.type === InteractionType.PING) {
    console.log('[INTERACTION] 回傳 Pong！');
    return res.json({ type: InteractionResponseType.PONG });
  }

  // Type 2：Slash Command
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const cmdName = interaction.data?.name ?? '(unknown)';
    console.log(`[INTERACTION] 處理指令: /${cmdName}`);

    if (cmdName === 'ask')             return handleAsk(interaction, res);
    if (cmdName === 'note')            return handleNote(interaction, res);
    if (cmdName === 'memberdatecheck') return handleMemberDateCheck(interaction, res);

    // 其他未知指令
    return res.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '光之助理連線成功！不過我的大腦還沒裝上去，稍等我一下！' },
    });
  }

  console.log(`[INTERACTION] 未知的 Interaction Type: ${interaction.type}`);
  return res.status(400).json({ error: 'Unknown interaction type' });
}

module.exports = { handleInteraction };
