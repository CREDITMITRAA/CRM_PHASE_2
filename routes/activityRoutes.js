const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/activityController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM } = require('../utilities/constants')

router.post('/add-activity', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.addActivity)
router.get('/get-activites-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.getActivitiesByLeadId)
router.put('/update-activity-by-activity-id/:activityId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.updateActivityByActivityId)
router.get('/get-all-activities', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.getAllActivities)
router.get('/get-all-tasks', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.getAllTasks)
router.post('/update-task-status', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.updateTaskStatus)
router.post('/update-docs-collected-by-activity-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.updateDocsCollectedByActivityId)
router.get('/get-recent-activity-notes-by-lead-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.getRecentActivityNotesByLeadId)
router.get('/get-recent-activity-by-lead-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.getRecentActivityByLeadId)

module.exports = router