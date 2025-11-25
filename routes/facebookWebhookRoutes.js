const express = require('express');
const router = express.Router();
const {
  handleFacebookWebhook,
  verifyWebhook,
} = require('../controllers/facebookWebhookController');

router.get('/facebook-leads', verifyWebhook);
router.post('/facebook-leads', handleFacebookWebhook);

module.exports = router;
