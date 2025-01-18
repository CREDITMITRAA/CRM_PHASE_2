const express = require('express')
const router = express.Router()
const WalkInController = require('../controllers/walkInController')

router.post('/schedule-walk-in', WalkInController.scheduleWalkIn)
router.get('/get-walk-ins', WalkInController.getWalkIns)
router.post('/update-walk-in-status', WalkInController.updateWalkInStatus)
router.post('/reschedule-walk-in',  WalkInController.rescheduleWalkIn)
router.get('/get-walk-ins-count', WalkInController.getWalkInsCount)
router.get('/get-walk-ins-by-lead-id', WalkInController.getWalkInsByLeadId)

module.exports = router