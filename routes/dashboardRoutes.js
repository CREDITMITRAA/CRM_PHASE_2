const express = require('express')
const router = express.Router()
const dashboardController = require('../controllers/dashboardController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.get('/get-dashboard-data', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), dashboardController.getDashboardData)
router.get('/get-charts-data', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), dashboardController.getChartsData)

module.exports = router