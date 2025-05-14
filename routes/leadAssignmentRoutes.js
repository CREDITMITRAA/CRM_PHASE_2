const express = require('express')
const router = express.Router()
const LeadAssignmentController = require('../controllers/leadAssignmentController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM } = require('../utilities/constants')

router.post('/assign', authenticate([ROLE_ADMIN]), LeadAssignmentController.assignLeadsToEmployee)
router.get('/get-leads-by-assigned-user-id/', authenticate([ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LeadAssignmentController.getLeadsByAssignedUserId)

module.exports = router