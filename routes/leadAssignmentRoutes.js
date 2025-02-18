const express = require('express')
const router = express.Router()
const LeadAssignmentController = require('../controllers/leadAssignmentController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_EMPLOYEE } = require('../utilities/constants')

router.post('/assign', authenticate([ROLE_ADMIN]), LeadAssignmentController.assignLeadsToEmployee)
router.get('/get-leads-by-assigned-user-id/', authenticate([ROLE_EMPLOYEE]), LeadAssignmentController.getLeadsByAssignedUserId)

module.exports = router