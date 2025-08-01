const express = require('express')
const router = express.Router()
const LoanReportsController = require('../controllers/loanReportController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM, ROLE_VIEWER } = require('../utilities/constants')

router.get('/get-loan-reports-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), LoanReportsController.getLoanReportsByLeadId)
router.get('/get-all-loan-reports', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), LoanReportsController.getAllLoanReports)
router.post('/update-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.updateLoanReport)
router.post('/delete-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.deleteLoanReport)
router.post('/add-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.addLoanReport)
router.post('/edit-loan-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.editLoanReport)
router.post('/delete-closing-document', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LoanReportsController.deleteLoanReportClosingDocument)

module.exports = router