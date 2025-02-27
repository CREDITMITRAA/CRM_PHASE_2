const express = require('express')
const router = express.Router()
const multer = require('multer')
const CallLogController = require('../controllers/CallLogController')
const upload = multer({ dest: 'uploads/' });

router.post('/create-call-log', upload.single('file'), CallLogController.createCallLog)
// router.post('/convert', upload.single('file'), CallLogController.convert)

module.exports = router