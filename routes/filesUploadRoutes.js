const express = require('express')
const router = express.Router()
const multer = require("multer");
const FileUploadController = require('../controllers/filesUploadController');
const { authenticate } = require('../middlewares/authenticationMiddleware');
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants');
// Multer setup for file upload
const upload = multer({ dest: 'uploads/' });

router.post('/upload-file',upload.single('file'),  authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), FileUploadController.uploadFile)
router.post('/upload-files', upload.array('files', 10), authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), FileUploadController.uploadMultipleFiles)

module.exports = router