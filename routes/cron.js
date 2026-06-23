const { Router } = require('express');
const sundayReminder = require('../controllers/cron/sundayReminder');
const mondaySchedule = require('../controllers/cron/mondaySchedule');
const saturdayUnfilled = require('../controllers/cron/saturdayUnfilled');

const router = Router();

router.post('/cron/sunday-reminder', sundayReminder);
router.post('/cron/monday-schedule', mondaySchedule);
router.post('/cron/saturday-unfilled', saturdayUnfilled);

module.exports = router;
