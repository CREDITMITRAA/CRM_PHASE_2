const express = require('express')
const router = express.Router()
const leadController = require('../controllers/leadController');
const { authenticate } = require('../middlewares/authenticationMiddleware');
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM } = require('../utilities/constants');

router.post('/create-bulk-leads', authenticate([ROLE_ADMIN]), leadController.createBulkLeads)
router.get('/get-all-leads-with-pagination', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.getAllLeadsWithPagination)
router.get('/get-lead-by-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.getLeadById)
router.post('/update-lead-reports-activity', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.updateLeadReportsActivities)
router.post('/update-verification-status', authenticate([ROLE_ADMIN,ROLE_MANAGER]), leadController.updateVerificationStatus)
router.get('/get-total-leads-count', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.getTotalLeadsCount)
router.post('/update-application-status', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_OPERATIONS_TEAM]), leadController.updateApplicationStatus)
router.post('/update-lead-status', authenticate([ROLE_ADMIN,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM, ROLE_MANAGER]), leadController.updateLeadStatus)
router.get('/get-all-lead-sources', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.getAllDistinctLeadSources)
router.get('/get-lead-source-by-name', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.getLeadSourceByName)
router.put('/update-lead-details/:id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.updateLeadDetails)
router.get('/get-all-leads-of-ex-emp', authenticate([ROLE_ADMIN]), leadController.getAllLeadsOfExEmployees)
router.post('/upload-lead', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM], true), leadController.uploadLead)
router.post('/add-new-lead', authenticate([ROLE_ADMIN]), leadController.addNewLead),
router.get('/get-crif-report-by-customer-id-or-phone', authenticate([ROLE_ADMIN]), leadController.getCrifReportByCustomerIdOrPhone)

module.exports = router