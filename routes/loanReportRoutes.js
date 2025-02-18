const express = require('express')
const router = express.Router()
const LoanReportsController = require('../controllers/loanReportController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.get('/get-loan-reports-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), LoanReportsController.getLoanReportsByLeadId)
router.get('/get-all-loan-reports', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), LoanReportsController.getAllLoanReports)
router.post('/update-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), LoanReportsController.updateLoanReport)
router.post('/delete-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), LoanReportsController.deleteLoanReport)

module.exports = router