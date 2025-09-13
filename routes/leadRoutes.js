const express = require('express')
const router = express.Router()
const leadController = require('../controllers/leadController');
const { authenticate } = require('../middlewares/authenticationMiddleware');
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM, ROLE_VIEWER } = require('../utilities/constants');

router.post('/create-bulk-leads', authenticate([ROLE_ADMIN]), leadController.createBulkLeads)
router.get('/get-all-leads-with-pagination', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), leadController.getAllLeadsWithPagination)
router.get('/get-lead-by-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), leadController.getLeadById)
router.post('/update-lead-reports-activity', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.updateLeadReportsActivities)
router.post('/update-verification-status', authenticate([ROLE_ADMIN,ROLE_MANAGER]), leadController.updateVerificationStatus)
router.get('/get-total-leads-count', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), leadController.getTotalLeadsCount)
router.post('/update-application-status', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_OPERATIONS_TEAM]), leadController.updateApplicationStatus)
router.post('/update-lead-status', authenticate([ROLE_ADMIN,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM, ROLE_MANAGER]), leadController.updateLeadStatus)
router.get('/get-all-lead-sources', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), leadController.getAllDistinctLeadSources)
router.get('/get-lead-source-by-name', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), leadController.getLeadSourceByName)
router.put('/update-lead-details/:id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), leadController.updateLeadDetails)
router.get('/get-all-leads-of-ex-emp', authenticate([ROLE_ADMIN]), leadController.getAllLeadsOfExEmployees)
router.post('/upload-lead', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM], true), leadController.uploadLead)
router.post('/add-new-lead', authenticate([ROLE_ADMIN]), leadController.addNewLead),
router.get('/get-crif-report-by-customer-id-or-phone', authenticate([ROLE_ADMIN,ROLE_VIEWER, ROLE_EMPLOYEE, ROLE_MANAGER]), leadController.getCrifReportByCustomerIdOrPhone)
router.get('/get-crif-summary-report', authenticate([ROLE_ADMIN,ROLE_VIEWER]), leadController.getCrifSummaryReport)
router.get('/get-customers', authenticate([ROLE_ADMIN,ROLE_VIEWER]), leadController.getCustomers)
router.get('/get-distinct-utm-campaigns-sources', authenticate([ROLE_ADMIN,ROLE_OPERATIONS_TEAM,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_VIEWER]), leadController.getAllDistinctUtmCampaignsAndSources)
router.get('/get-all-reengaged-leads', authenticate([ROLE_ADMIN,ROLE_EMPLOYEE,ROLE_MANAGER,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), leadController.getAllReEngagedLeads)
router.post('/download-crif-report', authenticate([ROLE_ADMIN,ROLE_OPERATIONS_TEAM,ROLE_MANAGER,ROLE_EMPLOYEE]), leadController.downloadCrifReport)
router.post('/upload-cibil-report', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.uploadCibilReport)
router.get('/get-cibil-report', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.getCibilReport)
router.post('/upload-experian-report', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.uploadExperianReport)
router.get('/get-experian-report', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.getExperianReport)
router.post('/upload-crif-parsed-report', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.uploadCrifParsedReport)
router.get('/get-crif-parsed-report', authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.getCrifParsedReport)
router.post('/update-b2c-report', authenticate([ROLE_ADMIN,ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE]), leadController.updateB2cReport)
module.exports = router