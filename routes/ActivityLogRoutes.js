const express = require('express')
const router = express.Router()
const ActivityController = require('../controllers/ActivityLogController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.get('/get-all-activity-logs', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.getActivityLogs)
router.post('/add-activity-log-note', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ActivityController.addActivityLogNote)

module.exports = router