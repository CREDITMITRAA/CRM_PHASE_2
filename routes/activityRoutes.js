const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/activityController')

router.post('/add-activity',ActivityController.addActivity)
router.get('/get-activites-by-lead-id/:leadId', ActivityController.getActivitiesByLeadId)
router.put('/update-activity-by-activity-id/:activityId',  ActivityController.updateActivityByActivityId)
router.get('/get-all-activities', ActivityController.getAllActivities)
router.get('/get-all-tasks', ActivityController.getAllTasks)
router.post('/update-task-status', ActivityController.updateTaskStatus)
router.post('/update-docs-collected-by-activity-id', ActivityController.updateDocsCollectedByActivityId)

module.exports = router