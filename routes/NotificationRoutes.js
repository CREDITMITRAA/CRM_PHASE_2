const express = require('express')
const router = express.Router()
const NotificationController = require('../controllers/NotificationController')

router.put('/acknowledge-notification/:notification_id', NotificationController.acknowledgeNotification)
router.get('/get-notifications-by-employee-id', NotificationController.getNotificationsByEmployeeId)
router.get('/get-unseen-notifications-count', NotificationController.getUnSeenNotificationsCount)

module.exports = router