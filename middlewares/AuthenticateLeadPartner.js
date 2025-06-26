const { LeadPartner } = require('../models');
const crypto = require('crypto');
const moment = require('moment');
const requestIP = require('request-ip');
const { ApiResponse } = require('../utilities/api-responses/ApiResponse');

const authenticatePartner = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const origin = req.headers.origin || req.headers.referer;
    const ip = requestIP.getClientIp(req);

    if (!apiKey || !signature || !timestamp) {
      return ApiResponse(res, "ERROR", 400, "Missing required headers");
    }

    const now = moment();
    const requestTime = moment.unix(parseInt(timestamp));
    if (!requestTime.isValid() || Math.abs(now.diff(requestTime, 'minutes')) > 3) {
      return ApiResponse(res, "ERROR", 401, 'Invalid or expired timestamp');
    }

    const partner = await LeadPartner.findOne({ where: { api_key: apiKey, is_active: true } });
    if (!partner) {
      return ApiResponse(res, "ERROR", 401, 'Invalid API key');
    }

    if (!partner.allowed_ips.includes(ip)) {
      return ApiResponse(res, "ERROR", 403, 'IP not allowed', ip);
    }

    if (origin) {
      const matched = partner.allowed_domains.some(domain => origin.includes(domain));
      if (!matched) {
        return ApiResponse(res, "ERROR", 403, 'Unauthorized domain origin');
      }
    }

    const requestBody = JSON.stringify(req.body || []);
    console.log('request body = ', requestBody);
    
    const bodyHash = crypto.createHash("sha256").update(requestBody).digest('hex')
    const payload = apiKey + bodyHash + timestamp;
    const hmac = crypto.createHmac('sha256', partner.api_secret);
    const expectedSignature = hmac.update(payload).digest('hex');

    if (signature !== expectedSignature) {
      return ApiResponse(res, "ERROR", 401, 'Invalid signature', signature);
    }

    req.leadPartner = partner;
    next();
  } catch (err) {
    console.error('[AuthMiddleware Error]', err);
    return ApiResponse(res, "ERROR", 500, "Internal security error", null, err.message);
  }
};

module.exports = authenticatePartner;