const express = require('express')
const router = express.Router()
const InvalidLeadController = require('../controllers/invalidLeadController')

router.delete('/delete-invalid-leads', InvalidLeadController.deleteInvalidLeads)
router.get('/get-all-invalid-leads', InvalidLeadController.getAllInvalidLeads)

module.exports = router