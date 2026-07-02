require('dotenv').config();
const { REST, Routes } = require('discord.js');

// 這裡定義我們要教給機器人的技能
const commands = [
  {
    // /ask 是複合(父)指令，底下掛子指令；未來新功能就在 options 再加一個 type:1 的子指令
    name: 'ask',
    description: '查詢類指令（出團時間等，未來持續擴充）',
    options: [
      {
        name: 'datecheck',
        description: '查未來出團時間',
        type: 1, // 1 代表子指令 (SUB_COMMAND)
      },
      {
        name: 'tour',
        description: '拓荒進度統計（時數、場次、最遠進度、卡關）',
        type: 1, // 1 代表子指令 (SUB_COMMAND)
      },
    ]
  },
  {
    // /note 是複合(父)指令：add 走 Modal 表單（支援多行輸入），search 依 phase 或日期查詢
    name: 'note',
    description: '拓荒筆記（新增 / 查詢）',
    options: [
      {
        name: 'add',
        description: '新增筆記（會跳出多行輸入視窗）',
        type: 1, // 1 代表子指令 (SUB_COMMAND)
      },
      {
        name: 'search',
        description: '查詢筆記（phase 或 date 至少填一個）',
        type: 1, // 1 代表子指令 (SUB_COMMAND)
        options: [
          {
            name: 'phase',
            description: 'Phase 數字（例如 3）',
            type: 4, // 4 代表整數 (INTEGER)
            required: false,
            min_value: 1,
          },
          {
            name: 'date',
            description: '日期 M/D（例如 6/23，查當天建立的筆記）',
            type: 3, // 3 代表字串 (STRING)
            required: false,
          },
        ],
      },
    ]
  },
  {
    name: 'memberdatecheck',
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
    
    console.log('成功註冊 /ask (datecheck, tour)、/note (add, search)、/memberdatecheck 指令！');
  } catch (error) {
    console.error('註冊失敗：', error);
  }
})();