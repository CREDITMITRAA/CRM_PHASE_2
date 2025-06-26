const { LeadPartner } = require('../models');
const bcrypt = require('bcrypt');
const { ApiResponse } = require('../utilities/api-responses/ApiResponse');

const verifyPartnerLogin = async (req, res, next) => {
  try {
    const { partner_code, password } = req.body;
    if (!partner_code || !password) {
      return ApiResponse(res, "ERROR", 400, "Missing credentials");
    }

    const partner = await LeadPartner.findOne({ where: { partner_code, is_active: true } });
    if (!partner) {
      return ApiResponse(res, "ERROR", 401, "Invalid partner code");
    }

    const match = await bcrypt.compare(password, partner.password_hash);
    if (!match) {
      return ApiResponse(res, "ERROR", 401, "Invalid password");
    }

    req.leadPartner = partner;
    next();
  } catch (err) {
    console.error('[LoginMiddleware Error]', err);
    return ApiResponse(res, "ERROR", 500, "Login error", null, err.message);
  }
};

module.exports = verifyPartnerLogin;
