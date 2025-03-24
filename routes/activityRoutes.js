const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/activityController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.post('/add-activity', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.addActivity)
router.get('/get-activites-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.getActivitiesByLeadId)
router.put('/update-activity-by-activity-id/:activityId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.updateActivityByActivityId)
router.get('/get-all-activities', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.getAllActivities)
router.get('/get-all-tasks', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.getAllTasks)
router.post('/update-task-status', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.updateTaskStatus)
router.post('/update-docs-collected-by-activity-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.updateDocsCollectedByActivityId)
router.get('/get-recent-activity-notes-by-lead-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.getRecentActivityNotesByLeadId)
router.get('/get-recent-activity-by-lead-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.getRecentActivityByLeadId)

module.exports = router