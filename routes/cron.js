const { Router } = require('express');
const reminder = require('../controllers/cron/reminder');
const schedule = require('../controllers/cron/schedule');
const unfilled = require('../controllers/cron/unfilled');

const router = Router();

router.post('/cron/reminder', reminder);
router.post('/cron/schedule', schedule);
router.post('/cron/unfilled', unfilled);

module.exports = router;
