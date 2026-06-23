require('dotenv').config();
const { REST, Routes } = require('discord.js');

// 這裡定義我們要教給機器人的技能
const commands = [
  {
    name: 'ask',
    description: '詢問排班表與拓荒攻略相關問題',
    options: [{
        name: 'question',
        description: '你想問什麼？（例如：明天有要打嗎？）',
        type: 3, // 3 代表字串 (STRING)
        required: true,
    }]
  },
  {
    name: 'note',
    description: '記錄今天的拓荒筆記或機制重點',
    options: [{
        name: 'content',
        description: '筆記內容（例如：運動會xxx要注意什麼）',
        type: 3, // 3 代表字串 (STRING)
        required: true,
    }]
  },
  {
    name: 'askdate',
    description: '查誰還沒填出團時間表（未來 14 天）',
    options: [{
        name: 'target',
        description: '輸入 all 查全員，或 @某人 / 名字 查個人',
        type: 3, // 3 代表字串 (STRING)
        required: true,
    }]
  }
];

// 初始化 Discord API 請求工具
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('開始向 Discord 註冊斜線指令...');
    
    // 將指令推送到你的機器人身上 (全域註冊)
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
    
    console.log('成功註冊 /ask、/note、/askdate 指令！');
  } catch (error) {
    console.error('註冊失敗：', error);
  }
})();