const express = require('express')
const router = express.Router()
const LoginDetailController = require("../controllers/LoginDetailController")

router.post('/add-login-details', LoginDetailController.addLoginDetails)
router.get('/get-login-details', LoginDetailController.getLoginDetails)
router.post('/edit-login-details', LoginDetailController.editLoginDetails)
router.post('/delete-login-details', LoginDetailController.deleteLoginDetails)

module.exports = router