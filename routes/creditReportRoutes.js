const express =require('express')
const router = express.Router()
const CreditReportController = require('../controllers/creditReportController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM, ROLE_VIEWER } = require('../utilities/constants')

router.get('/get-credit-reports-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), CreditReportController.getCreditReportsByLeadId)
router.get('/get-all-credit-reports', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), CreditReportController.getAllCreditReports)
// router.delete('/delete-credit-report', CreditReportController.deleteCreditReportById)
router.post('/delete-credit-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), CreditReportController.deleteCreditReport)
router.post('/add-credit-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), CreditReportController.addCreditReport)
router.post('/edit-credit-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), CreditReportController.editCreditReport)
router.post('/delete-closing-document', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), CreditReportController.deleteCreditReportClosingDocument)

module.exports = router