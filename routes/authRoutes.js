const express = require('express');
const router = express.Router();
const LoginController = require('./../controllers/authController');
const { authenticate } = require('../middlewares/authenticationMiddleware');
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants');

router.post('/login',LoginController.login)
router.post('/logout', LoginController.logout)
router.post('/update-password', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), LoginController.updatePassword)
// router.post('/refresh',LoginController.refresh)

module.exports = router