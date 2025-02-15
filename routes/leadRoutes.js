const express = require('express')
const router = express.Router()
const leadController = require('../controllers/leadController');

router.post('/create-bulk-leads', leadController.createBulkLeads)
router.get('/get-all-leads-with-pagination', leadController.getAllLeadsWithPagination)
router.get('/get-lead-by-id/:leadId', leadController.getLeadById)
router.post('/update-lead-reports-activity', leadController.updateLeadReportsActivities)
router.post('/update-verification-status', leadController.updateVerificationStatus)
router.get('/get-total-leads-count', leadController.getTotalLeadsCount)
router.post('/update-application-status', leadController.updateApplicationStatus)
router.post('/update-lead-status', leadController.updateLeadStatus)
router.get('/get-all-lead-sources',leadController.getAllDistinctLeadSources)
router.get('/get-lead-source-by-name', leadController.getLeadSourceByName)
router.put('/update-lead-details/:id', leadController.updateLeadDetails)
router.get('/get-all-leads-of-ex-emp',leadController.getAllLeadsOfExEmployees)

module.exports = router