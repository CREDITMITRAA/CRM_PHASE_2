const express = require('express')
const router = express.Router()
const ExEmployeesController = require("../controllers/ExEmployeeController")

router.get('/get-ex-employees-leads', ExEmployeesController.getExEmployeesLeads)

module.exports = router