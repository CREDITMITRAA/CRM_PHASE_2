const express = require('express')
const router = express.Router()
const ProfileImageUrlController = require('../controllers/ProfileImageUrlController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.get('/get-all-profile-image-urls', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), ProfileImageUrlController.getAllProfileImageUrls)

module.exports = router