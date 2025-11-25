const { LeadPartner } = require('../models');
const crypto = require('crypto');
const moment = require('moment');
const { ApiResponse } = require('../utilities/api-responses/ApiResponse');
const { isValidIP, getClientIP } = require('../utilities/ipUtils');

const authenticatePartner = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const partnerCode = req.headers['x-partner-code'];
    const origin = req.headers.origin || req.headers.referer;
    
    // Use reliable IP extraction
    const ip = getClientIP(req);

    console.log('🔐 Authentication Debug:', {
      ip,
      partnerCode,
      origin,
      hasApiKey: !!apiKey,
      hasSignature: !!signature,
      hasTimestamp: !!timestamp
    });

    // Validate required headers
    if (!apiKey || !signature || !timestamp || !partnerCode) {
      console.log('❌ Missing headers:', { apiKey: !!apiKey, signature: !!signature, timestamp: !!timestamp, partnerCode: !!partnerCode });
      return ApiResponse(res, "ERROR", 400, "Missing required headers");
    }

    // Validate timestamp
    const now = moment();
    const requestTime = moment.unix(parseInt(timestamp));
    
    if (!requestTime.isValid()) {
      console.log('❌ Invalid timestamp:', timestamp);
      return ApiResponse(res, "ERROR", 401, 'Invalid timestamp');
    }

    const timeDiff = Math.abs(now.diff(requestTime, 'minutes'));
    if (timeDiff > 3) {
      console.log('❌ Expired timestamp:', { requestTime: requestTime.format(), now: now.format(), diff: timeDiff });
      return ApiResponse(res, "ERROR", 401, 'Expired timestamp');
    }

    // Find partner
    const partner = await LeadPartner.findOne({ 
      where: { 
        api_key: apiKey, 
        is_active: true 
      } 
    });

    if (!partner) {
      console.log('❌ Invalid API key:', apiKey);
      return ApiResponse(res, "ERROR", 401, 'Invalid API key');
    }

    // Validate partner code
    if (partnerCode !== partner.partner_code) {
      console.log('❌ Invalid partner code:', { received: partnerCode, expected: partner.partner_code });
      return ApiResponse(res, "ERROR", 401, 'Invalid partner code');
    }

    // IP Validation with detailed logging
    console.log('📡 IP Validation:', {
      receivedIP: ip,
      allowedIPs: partner.allowed_ips,
      isValidIP: isValidIP(ip),
      isInAllowedList: partner.allowed_ips.includes(ip)
    });

    if (!isValidIP(ip)) {
      console.log('❌ Invalid IP format:', ip);
      return ApiResponse(res, "ERROR", 403, 'Invalid IP format', ip);
    }

    if (!partner.allowed_ips.includes(ip)) {
      console.log('❌ IP not allowed:', { ip, allowedIPs: partner.allowed_ips });
      return ApiResponse(res, "ERROR", 403, 'IP not allowed', ip);
    }

    // Domain origin validation
    if (origin) {
      const matched = partner.allowed_domains.some(domain => origin.includes(domain));
      console.log('🌐 Domain Validation:', { origin, allowedDomains: partner.allowed_domains, matched });
      
      if (!matched) {
        return ApiResponse(res, "ERROR", 403, 'Unauthorized domain origin');
      }
    }

    // Signature validation
    const requestBody = JSON.stringify(req.body || {});
    const bodyHash = crypto.createHash("sha256").update(requestBody).digest('hex');
    const payload = apiKey + bodyHash + timestamp;
    const hmac = crypto.createHmac('sha256', partner.api_secret);
    const expectedSignature = hmac.update(payload).digest('hex');

    console.log('🔏 Signature Debug:', {
      bodyHash,
      payloadLength: payload.length,
      signatureReceived: signature,
      signatureExpected: expectedSignature,
      match: signature === expectedSignature
    });

    if (signature !== expectedSignature) {
      return ApiResponse(res, "ERROR", 401, 'Invalid signature');
    }

    console.log('✅ Authentication successful for partner:', partner.partner_code);
    req.leadPartner = partner;
    next();

  } catch (err) {
    console.error('💥 [AuthMiddleware Error]', err);
    return ApiResponse(res, "ERROR", 500, "Internal security error", null, err.message);
  }
};

module.exports = authenticatePartner;