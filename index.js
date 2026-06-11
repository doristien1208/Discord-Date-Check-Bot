require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動成功！正在監聽 Port ${PORT}`);
  console.log(`   本機健康檢查 : http://localhost:${PORT}/`);
  console.log(`   Interactions  : http://localhost:${PORT}/interactions\n`);
});