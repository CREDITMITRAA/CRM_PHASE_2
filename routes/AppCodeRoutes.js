const express = require("express")
const router = express.Router()
const AppCodeController = require("../controllers/AppCodeController")

router.post('/generate-app-code', AppCodeController.generateCode)

module.exports = router