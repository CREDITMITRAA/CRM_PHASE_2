const express = require('express')
const router = express.Router()
const multer = require('multer')
const CallLogController = require('../controllers/CallLogController')
const upload = multer({ dest: 'uploads/' });

// router.post('/create-call-log', upload.single('file'), CallLogController.createCallLog)
// router.post('/convert', upload.single('file'), CallLogController.convert)
router.post('/add-call-log', CallLogController.addCallLog)
router.get('/get-overall-calls-summary', CallLogController.getOverallCallsSummary)
router.get('/get-call-logs', CallLogController.getCallLogs)
router.get('/get-call-analytics', CallLogController.getCallAnalytics)
router.post('/upload-call-recording-file', CallLogController.uploadCallRecordingFile)
module.exports = router