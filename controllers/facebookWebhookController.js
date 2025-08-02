const { Lead } = require('../models'); // Sequelize model
const { ApiResponse } = require('../utilities/api-responses/ApiResponse');

exports.verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

exports.handleFacebookWebhook = async (req, res) => {
    console.log("📥 Webhook received:", req.body);

  const body = req.body;

  if (body.object !== 'page') return res.sendStatus(404);

  try {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'leadgen') {
          const { leadgen_id, form_id, ad_id, created_time, page_id } = change.value;

          // TODO: Optionally fetch from Facebook Graph API

          const leadPayload = {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '9876543210',
            lead_source: 'facebook',
            product: 'Personal Loan',
            utm_source: 'facebook',
            utm_campaign: form_id,
            fb_leadgen_id: leadgen_id,
          };

          // Upsert logic if phone exists
          await Lead.upsert(leadPayload, {
            where: { phone: leadPayload.phone },
          });
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return ApiResponse(res, 'error', 500, 'Error processing webhook', null, err);
  }
};
