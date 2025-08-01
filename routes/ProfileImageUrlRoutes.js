const express = require('express')
const router = express.Router()
const ProfileImageUrlController = require('../controllers/ProfileImageUrlController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM, ROLE_VIEWER } = require('../utilities/constants')

router.get('/get-all-profile-image-urls', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM,ROLE_VIEWER]), ProfileImageUrlController.getAllProfileImageUrls)

module.exports = router