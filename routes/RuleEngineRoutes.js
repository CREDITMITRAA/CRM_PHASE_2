const express = require("express")
const router = express.Router()
const RuleEngineController = require("../controllers/RuleEngineController")
const { authenticate } = require("../middlewares/authenticationMiddleware")
const { ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE } = require("../utilities/constants")

router.post('/run', authenticate([ROLE_ADMIN,ROLE_OPERATIONS_TEAM,ROLE_MANAGER,ROLE_EMPLOYEE], false), RuleEngineController.runRuleEngine)

module.exports = router