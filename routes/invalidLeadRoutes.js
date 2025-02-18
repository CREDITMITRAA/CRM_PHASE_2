const express = require('express')
const router = express.Router()
const InvalidLeadController = require('../controllers/invalidLeadController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN } = require('../utilities/constants')

router.delete('/delete-invalid-leads', authenticate([ROLE_ADMIN]), InvalidLeadController.deleteInvalidLeads)
router.get('/get-all-invalid-leads', authenticate([ROLE_ADMIN]), InvalidLeadController.getAllInvalidLeads)
router.post('/delete-invalid-leads-by-lead-ids', authenticate([ROLE_ADMIN]), InvalidLeadController.deleteInvalidLeadsByLeadIds)
router.get('/get-distinct-invalid-lead-reasons', authenticate([ROLE_ADMIN]), InvalidLeadController.getDistinctInvalidLeadReasons)

module.exports = router