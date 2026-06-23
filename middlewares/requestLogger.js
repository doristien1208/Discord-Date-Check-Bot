function requestLogger(req, res, next) {
  const ts = new Date().toISOString();
  const sigEd = req.headers['x-signature-ed25519'];
  const sigTs = req.headers['x-signature-timestamp'];
  console.log(`\n[${ts}] 收到請求: ${req.method} ${req.path}`);
  console.log(`   x-signature-ed25519   : ${sigEd ? `${sigEd.slice(0, 16)}...` : '未提供（非 Discord 請求）'}`);
  console.log(`   x-signature-timestamp : ${sigTs ? `${sigTs}` : '未提供'}`);
  next();
}

module.exports = requestLogger;
