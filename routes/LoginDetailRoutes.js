const express = require('express')
const router = express.Router()
const LoginDetailController = require("../controllers/LoginDetailController")
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_OPERATIONS_TEAM, ROLE_VIEWER } = require('../utilities/constants')

router.post('/add-login-details', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_OPERATIONS_TEAM,ROLE_MANAGER]), LoginDetailController.addLoginDetails)
router.get('/get-login-details', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_OPERATIONS_TEAM,ROLE_MANAGER,ROLE_VIEWER]), LoginDetailController.getLoginDetails)
router.post('/edit-login-details', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_OPERATIONS_TEAM,ROLE_MANAGER]), LoginDetailController.editLoginDetails)
router.post('/delete-login-details', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_OPERATIONS_TEAM,ROLE_MANAGER]), LoginDetailController.deleteLoginDetails)
router.get('/get-logins-overall-summary', authenticate([ROLE_ADMIN,ROLE_VIEWER]), LoginDetailController.getLoginsOverallSummary)
router.get('/get-leads-with-logins-summary', authenticate([ROLE_ADMIN, ROLE_VIEWER]), LoginDetailController.getLeadsWithLoginsSummary)
module.exports = router