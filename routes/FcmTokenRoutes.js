const express = require('express')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_EMPLOYEE, ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER } = require('../utilities/constants')
const router = express.Router()
const FcmTokenController = require("../controllers/FcmTokenController")

router.post('/register-device', FcmTokenController.registerDevice)
router.post('/initiate-call', FcmTokenController.initiateCall)

module.exports = router