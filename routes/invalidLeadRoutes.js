const express = require('express')
const router = express.Router()
const InvalidLeadController = require('../controllers/invalidLeadController')

router.delete('/delete-invalid-leads', InvalidLeadController.deleteInvalidLeads)
router.get('/get-all-invalid-leads', InvalidLeadController.getAllInvalidLeads)
router.post('/delete-invalid-leads-by-lead-ids', InvalidLeadController.deleteInvalidLeadsByLeadIds)

module.exports = router