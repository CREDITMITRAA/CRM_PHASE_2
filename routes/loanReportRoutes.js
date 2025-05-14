const express = require('express')
const router = express.Router()
const LoanReportsController = require('../controllers/loanReportController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM } = require('../utilities/constants')

router.get('/get-loan-reports-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.getLoanReportsByLeadId)
router.get('/get-all-loan-reports', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.getAllLoanReports)
router.post('/update-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.updateLoanReport)
router.post('/delete-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.deleteLoanReport)
router.post('/add-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.addLoanReport)

module.exports = router