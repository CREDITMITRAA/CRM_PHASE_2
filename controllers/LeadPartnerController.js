const { Op } = require("sequelize");
const { sequelize, LeadPartner, Lead, InvalidLead } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { LEAD_AGGREGATOR, CONNECTOR } = require("../utilities/constants");
const {
  generateApiCredentials,
  generatePartnerCode,
} = require("../utilities/helper-functions");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

async function addLeadPartner(req, res) {
  const transaction = await sequelize.transaction();
  try {
    let {
      name,
      poc_name,
      poc_mobile,
      poc_email,
      lead_partner_type,
      allowed_ips,
      allowed_domains,
      password,
    } = req.body;
    if (
      !poc_name ||
      !poc_mobile ||
      !poc_email ||
      !lead_partner_type ||
      !allowed_ips ||
      !allowed_domains ||
      !password
    ) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    if (lead_partner_type === LEAD_AGGREGATOR && !name) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Name is required for Lead Aggregator !"
      );
    }

    const validLeadPartnerTypes = [LEAD_AGGREGATOR, CONNECTOR];
    if (!validLeadPartnerTypes.includes(lead_partner_type)) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Invalid Lead Partner Type !");
    }

    const existingLeadPartner = await LeadPartner.findOne({
      where: {
        [Op.or]:[
          {poc_email},
          {poc_mobile}
        ],
        status:'active',
        is_active:true
      },
      transaction,
    });

    if (existingLeadPartner) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 409, "Lead Partner already exists !");
    }

    if (lead_partner_type === CONNECTOR && !name) {
      name = poc_name;
    }

    const { api_key, api_secret } = generateApiCredentials();
    let partner_code = await generatePartnerCode(lead_partner_type);

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const savedLeadPartner = await LeadPartner.create(
      {
        name,
        partner_code,
        poc_mobile,
        poc_name,
        poc_email,
        lead_partner_type,
        api_key,
        api_secret,
        is_active: true,
        allowed_ips,
        allowed_domains,
        password: hashedPassword,
      },
      { transaction }
    );

    transaction.commit();

    return ApiResponse(
      res,
      "SUCCESS",
      201,
      "Lead Partner Added Successfully !",
      {
        id: savedLeadPartner.id,
        name: savedLeadPartner.name,
        poc_name: savedLeadPartner.poc_name,
        poc_mobile: savedLeadPartner.poc_mobile,
        poc_email: savedLeadPartner.poc_email,
        password: savedLeadPartner.password,
        lead_partner_type: savedLeadPartner.lead_partner_type,
        api_key: savedLeadPartner.api_key,
        api_secret: savedLeadPartner.api_secret,
        allowed_ips: savedLeadPartner.allowed_ips,
        allowed_domains: savedLeadPartner.allowed_domains,
        is_active: savedLeadPartner.is_active,
        status: savedLeadPartner.status,
      }
    );
  } catch (error) {
    console.log("error in adding lead partner = ", error);
    transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to add lead partner !",
      null,
      error
    );
  }
}

async function uploadLeadsFromLeadPartner(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const leadPartnerName = req.leadPartner?.name;
    const inputData = Array.isArray(req.body.leads)
      ? req.body.leads
      : [req.body.leads];
    const isBulk = Array.isArray(req.body.leads);

    if (inputData.length === 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "No leads provided");
    }

    let validLeads = [];
    let invalidLeads = [];
    let normalizedLeads = [];
    let phoneSet = new Set();

    // Pre-process to collect normalized phones and detect required field errors
    for (const lead of inputData) {
      const { name, phone, email, score, salary } = lead;

      if (!name || !phone || !email || !score || !salary) {
        invalidLeads.push({
          ...lead,
          reason: "Missing required fields",
          lead_source: leadPartnerName,
        });
        continue;
      }

      const phoneRaw = phone.toString();
      const phoneReason = getPhoneValidationReason(phoneRaw);
      const normalizedPhone = extractTenDigitMobile(phoneRaw);

      if (phoneReason || !normalizedPhone) {
        invalidLeads.push({
          ...lead,
          phone: phoneRaw,
          reason: phoneReason || "Invalid phone format",
          lead_source: leadPartnerName,
          original_data: JSON.stringify(lead),
        });
        continue;
      }

      normalizedLeads.push({ ...lead, normalizedPhone });
      phoneSet.add(normalizedPhone);
    }

    // Fetch existing leads in one DB query
    const existingLeads = await Lead.findAll({
      where: {
        phone: [...phoneSet],
        status: "active",
      },
      transaction,
    });

    const existingLeadMap = new Map();
    for (const l of existingLeads) {
      existingLeadMap.set(l.phone, l);
    }

    // Filter valid leads and mark duplicates
    for (const lead of normalizedLeads) {
      const { normalizedPhone } = lead;
      if (existingLeadMap.has(normalizedPhone)) {
        const existing = existingLeadMap.get(normalizedPhone);
        invalidLeads.push({
          ...lead,
          phone: normalizedPhone,
          reason: `Duplicate of lead ID: ${existing.id}`,
          lead_source: leadPartnerName,
          original_data: JSON.stringify(lead),
        });
        continue;
      }

      validLeads.push({
        name: lead.name,
        phone: normalizedPhone,
        email: lead.email,
        score: lead.score,
        salary: lead.salary,
        lead_source: leadPartnerName,
        status: "active",
        last_updated_status: "Not Contacted",
        ...(lead.bereau_score && {bereau_score: lead.bereau_score}),
        ...(lead.campaign && {utm_campaign: lead.campaign})
      });
    }

    // Insert valid leads
    let createdLeads = [];
    if (validLeads.length > 0) {
      try {
        createdLeads = await Lead.bulkCreate(validLeads, { transaction });
      } catch (bulkError) {
        console.error("Bulk create error:", bulkError);
        for (const lead of validLeads) {
          try {
            const created = await Lead.create(lead, { transaction });
            createdLeads.push(created);
          } catch (err) {
            invalidLeads.push({
              ...lead,
              reason: err.message || "Insert failed",
              original_data: JSON.stringify(lead),
            });
          }
        }
      }
    }

    // Store invalid leads
    if (invalidLeads.length > 0) {
      try {
        await InvalidLead.bulkCreate(invalidLeads, { transaction });
      } catch (bulkInvalidErr) {
        console.error("Invalid lead bulk create error:", bulkInvalidErr);
        for (const lead of invalidLeads) {
          try {
            await InvalidLead.create(lead, { transaction });
          } catch (err) {
            console.error("Failed to store invalid lead:", err);
          }
        }
      }
    }

    await transaction.commit();

    const response = {
      totalReceived: inputData.length,
      validCount: createdLeads.length,
      invalidCount: invalidLeads.length,
      createdLeads: createdLeads.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        ...(bereau_score && {bereau_score: l.bereau_score}),
        ...(campaign && {utm_campaign: l.utm_campaign})
      })),
      invalidLeads: invalidLeads.map((l) => ({
        reason: l.reason,
        phone: l.phone,
        original_data: l.original_data,
      })),
    };

    return ApiResponse(
      res,
      "SUCCESS",
      201,
      isBulk ? "Bulk leads processed" : "Lead processed",
      response
    );
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Lead processing error:", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to process leads",
      null,
      error.message
    );
  }
}

const isValidIndianMobile = (phone) => {
  if (!phone || typeof phone !== "string") return false;

  // Remove all whitespace and hyphens
  const cleaned = phone.replace(/[\s-]/g, "");

  // Check for alphabetic characters
  if (/[a-zA-Z]/.test(cleaned)) return false;

  // Extract only digits
  const digitsOnly = cleaned.replace(/\D/g, "");

  // Check for valid 10-digit mobile number (without prefix)
  if (/^[6-9]\d{9}$/.test(digitsOnly)) return true;

  // Check for valid prefixed numbers (+91, 91, 0, 0091, 091)
  if (/^(\+|0{0,2}91)/.test(cleaned)) {
    // Should have exactly 12 digits (91 + 10) or 11 digits (0 + 10)
    if (
      digitsOnly.length === 12 &&
      digitsOnly.startsWith("91") &&
      /^[6-9]/.test(digitsOnly.substring(2))
    ) {
      return true;
    }
    if (
      digitsOnly.length === 11 &&
      digitsOnly.startsWith("0") &&
      /^[6-9]/.test(digitsOnly.substring(1))
    ) {
      return true;
    }
    // Handle 0091/091 cases (14 digits total for 0091, 13 for 091)
    if (
      digitsOnly.startsWith("0091") &&
      digitsOnly.length === 14 &&
      /^[6-9]/.test(digitsOnly.substring(4))
    ) {
      return true;
    }
    if (
      digitsOnly.startsWith("091") &&
      digitsOnly.length === 13 &&
      /^[6-9]/.test(digitsOnly.substring(3))
    ) {
      return true;
    }
  }

  return false;
};

const extractTenDigitMobile = (phone) => {
  if (!isValidIndianMobile(phone)) return null;

  const cleaned = phone.replace(/[\s-]/g, "");
  const digitsOnly = cleaned.replace(/\D/g, "");

  // Handle +91/0091/91/091 prefixes
  if (digitsOnly.startsWith("0091") && digitsOnly.length === 14) {
    return digitsOnly.substring(4);
  }
  if (digitsOnly.startsWith("091") && digitsOnly.length === 13) {
    return digitsOnly.substring(3);
  }
  if (
    (digitsOnly.startsWith("+91") || digitsOnly.startsWith("91")) &&
    digitsOnly.length === 12
  ) {
    return digitsOnly.substring(2);
  }
  if (digitsOnly.startsWith("0") && digitsOnly.length === 11) {
    return digitsOnly.substring(1);
  }

  // Plain 10-digit number
  if (digitsOnly.length === 10) {
    return digitsOnly;
  }

  return null;
};

const getPhoneValidationReason = (rawPhone) => {
  if (!rawPhone || typeof rawPhone !== "string") return "Phone is missing";
  if (/[a-zA-Z]/.test(rawPhone)) return "Contains alphabetic characters";

  const cleaned = rawPhone.replace(/[\s-]/g, "");
  const digitsOnly = cleaned.replace(/\D/g, "");

  if (isValidIndianMobile(rawPhone)) return null;

  // Specific error messages
  if (digitsOnly.length > 14)
    return "Too many digits (maximum 14 with 0091 prefix)";
  if (digitsOnly.length < 10)
    return `Only ${digitsOnly.length} digits (need 10)`;

  if (digitsOnly.length === 10 && !/^[6-9]/.test(digitsOnly)) {
    return "Invalid starting digit (must be 6-9)";
  }

  if (/^00[^91]/.test(cleaned)) return "Invalid international prefix";
  if (/^\+[^9]/.test(cleaned)) return "Invalid international prefix";

  // Landline specific checks
  if (/^[02]/.test(digitsOnly)) return "Landline numbers not accepted";

  return "Invalid phone format";
};

async function generateHeaders(req, res) {
  try {
    const { api_key, api_secret, ...leads } = req.body;

    if (!api_key || !api_secret || !leads) {
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const requestBody = JSON.stringify(leads || []);

    const bodyHash = crypto
      .createHash("sha256")
      .update(requestBody)
      .digest("hex");
    const payload = api_key + bodyHash + timestamp;
    const signature = crypto
      .createHmac("sha256", api_secret)
      .update(payload)
      .digest("hex");

    let response = {
      "x-api-key": api_key,
      "x-timestamp": timestamp,
      "=x-signature": signature,
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Headers generated successfully",
      response
    );
  } catch (error) {
    console.log("error = ", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to generate headers !",
      null,
      error
    );
  }
}

async function getAllLeadPartners(req, res) {
  try {
    const { page = 1, pageSize = 25 } = req.query;
    const offset = (page - 1) * pageSize;

    const leadPartners = await LeadPartner.findAll({
      where: { status: "active" },
      attributes: [
        "id",
        "partner_code",
        "name",
        "poc_mobile",
        "poc_name",
        "poc_email",
        "lead_partner_type",
        "api_key",
        "api_secret",
        "allowed_ips",
        "allowed_domains",
        "is_active",
        "createdAt",
        "updatedAt",
      ],
      order: [["updatedAt", "DESC"]],
      limit: parseInt(pageSize),
      offset: parseInt(offset),
    });

    const totalCount = await LeadPartner.count({
      where: { status: "active" },
    });

    let pagination = {
      total: totalCount,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Lead partners fetch successfully",
      leadPartners,
      null,
      pagination
    );
  } catch (error) {
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to fetch all lead partners",
      null,
      error
    );
  }
}

async function updateLeadPartnerDetails(req, res) {
  try {
    const leadPartner = await LeadPartner.findByPk(req.params.id);

    if (!leadPartner) {
      return ApiResponse(res, "ERROR", 404, "Lead partner not found !");
    }

    // Check if the password field is in the request body
    if (req.body.password) {
      // Hash the new password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(req.body.password, salt);
      req.body.password = hashedPassword;
    }

    // Update user with the rest of the fields
    const updatedLeadPartner = await leadPartner.update(req.body);

    ApiResponse(res, "SUCCESS", 200, "Lead partner updated successfully", updatedLeadPartner);
  } catch (error) {
    console.log('error in updating lead partner details = ', error);
    
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to update lead partner details !",
      null,
      error
    );
  }
}

async function deleteLeadPartnerById(req,res){
  const transaction = await sequelize.transaction()
  try {
      const leadPartnerId = req.params.id
      // Check if the user exists
    const leadPartner = await LeadPartner.findByPk(leadPartnerId, { transaction });
    if (!leadPartner) {
      return ApiResponse(res, "ERROR", 404, "Lead partner not found");
    }

    // Soft delete user
    leadPartner.status = "inactive";
    leadPartner.is_active = false
    await leadPartner.save({ transaction });

    // Commit the transaction
    await transaction.commit();

    ApiResponse(
      res,
      "SUCCESS",
      200,
      "Lead partner deleted successfully",
      leadPartner.id
    );
  } catch (error) {
    console.log('error in deleting lead partner = ', error);
    return ApiResponse(res, "ERROR", 500, "Failed to delete lead partner !", null, error)
  }
}

module.exports = {
  addLeadPartner,
  uploadLeadsFromLeadPartner,
  generateHeaders,
  getAllLeadPartners,
  updateLeadPartnerDetails,
  deleteLeadPartnerById
};
