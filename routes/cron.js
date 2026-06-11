const { Router } = require('express');
const sundayReminder = require('../controllers/cron/sundayReminder');
const mondaySchedule = require('../controllers/cron/mondaySchedule');

const router = Router();

router.post('/cron/sunday-reminder', sundayReminder);
router.post('/cron/monday-schedule', mondaySchedule);

module.exports = router;
