const express = require('express')
const router = express.Router()
const BackupController = require('../controllers/backupController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.post('/create-backup',authenticate([ROLE_ADMIN]), BackupController.createBackup)

module.exports = router