const { google } = require('googleapis');
require('dotenv').config();

// 設定金鑰與授權範圍
const auth = new google.auth.GoogleAuth({
  keyFile: './credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

async function getRaidDates() {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // 讀取「當前總時數計算」工作表的 A2 到 A1000
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'當前總時數計算'!A2:A1000", 
    });

    // 【防呆優化】使用 ?. 確保就算 API 沒回傳 values 也不會崩潰，並預設為空陣列 []
    const rows = response?.data?.values || [];

    if (rows.length === 0) {
      return '目前沒有全員到齊的日期喔！';
    }

    // 將抓下來的二維陣列攤平，過濾掉可能有錯誤訊息的字串，並組合成一行
    const dates = rows
      .map(row => row[0])
      .filter(date => date && date !== '目前沒有全員到齊的日期')
      .join(', ');

    return dates ? `⚔️ 接下來有湊滿 8 人的出團日期為：${dates}` : '目前沒有全員到齊的日期喔！';

  } catch (error) {
    // 這裡會印出更精準的錯誤訊息，方便我們除錯
    console.error('❌ 讀取 Google Sheet 發生錯誤：', error.message);
    return '讀取排班表失敗，請檢查權限或檔案設定！';
  }
}

// 單獨測試用：直接印出結果
getRaidDates().then(console.log);

module.exports = { getRaidDates };