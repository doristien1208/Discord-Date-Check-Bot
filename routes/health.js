const { Router } = require('express');

const router = Router();

router.get('/', (req, res) => {
  res.send('✅ Bot server is running!');
});

module.exports = router;
