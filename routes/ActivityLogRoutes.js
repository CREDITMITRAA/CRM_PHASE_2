const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/ActivityLogController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM, ROLE_VIEWER } = require('../utilities/constants')

router.get('/get-all-activity-logs', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), ActivityController.getActivityLogs)
router.post('/add-activity-log-note', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), ActivityController.addActivityLogNote)
router.get('/get-lead-basic-details-change-history', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), ActivityController.getLeadBasicDetailsChangeHistory)

module.exports = router