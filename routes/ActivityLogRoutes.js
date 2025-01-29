const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/ActivityLogController')

router.get('/get-all-activity-logs', ActivityController.getActivityLogs)

module.exports = router