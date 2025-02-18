const express =require('express')
const router = express.Router()
const CreditReportController = require('../controllers/creditReportController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.get('/get-credit-reports-by-lead-id/:leadId', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), CreditReportController.getCreditReportsByLeadId)
router.get('/get-all-credit-reports', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), CreditReportController.getAllCreditReports)
// router.delete('/delete-credit-report', CreditReportController.deleteCreditReportById)
router.post('/delete-credit-report', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), CreditReportController.deleteCreditReport)

module.exports = router