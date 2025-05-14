const express = require('express')
const router = express.Router()
const WalkInController = require('../controllers/walkInController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM } = require('../utilities/constants')

router.post('/schedule-walk-in', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), WalkInController.scheduleWalkIn)
router.get('/get-walk-ins', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), WalkInController.getWalkIns)
router.post('/update-walk-in-status', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), WalkInController.updateWalkInStatus)
router.post('/reschedule-walk-in', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), WalkInController.rescheduleWalkIn)
router.get('/get-walk-ins-count', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), WalkInController.getWalkInsCount)
router.get('/get-walk-ins-by-lead-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), WalkInController.getWalkInsByLeadId)

module.exports = router