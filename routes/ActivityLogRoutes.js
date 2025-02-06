const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/ActivityLogController')

router.get('/get-all-activity-logs', ActivityController.getActivityLogs)
router.post('/add-activity-log-note', ActivityController.addActivityLogNote)

module.exports = router