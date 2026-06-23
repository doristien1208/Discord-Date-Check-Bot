const { InteractionResponseType } = require('discord-interactions');

function handleNote(interaction, res) {
  const noteContent = interaction.data.options[0].value;
  return res.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `已經幫你把筆記「${noteContent}」記下來囉！（資料庫連線即將實裝）`,
      flags: 64, // 64 = EPHEMERAL，只有觸發指令的人看得到
    },
  });
}

module.exports = handleNote;
