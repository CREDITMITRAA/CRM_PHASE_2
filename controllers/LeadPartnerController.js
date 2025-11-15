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
      await transaction.rollback()
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

    await transaction.commit();

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
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to add lead partner !",
      null,
      error
    );
  }
}

async function uploadLeadsFromLeadPartner(req, res) {
  const transaction = await sequelize.transaction();
  let transactionCommitted = false; // Track transaction state
  
  try {
    const leadPartnerName = req.leadPartner?.name;
    const inputData = Array.isArray(req.body.leads)
      ? req.body.leads
      : [req.body.leads];
    const isBulk = Array.isArray(req.body.leads);

    if (inputData.length === 0) {
      await transaction.rollback();
      return ApiResponse(
        res, 
        "ERROR", 
        400, 
        "No leads provided. Please include at least one lead in your request."
      );
    }

    let validLeads = [];
    let invalidLeads = [];
    let normalizedLeads = [];
    let phoneSet = new Set();

    // Pre-process to collect normalized phones and detect required field errors
    for (const lead of inputData) {
      const { name, phone, email, score, salary } = lead;

      if (!name || !phone ) {
        const missingFields = [];
        if (!name) missingFields.push("name");
        if (!phone) missingFields.push("phone");
        if (!email) missingFields.push("email");
        if (!score) missingFields.push("score");
        if (!salary) missingFields.push("salary");
        
        invalidLeads.push({
          phone: phone || "N/A",
          reason: `Missing required field(s): ${missingFields.join(", ")}`,
          lead_source: leadPartnerName,
        });
        continue;
      }

      const phoneRaw = phone.toString();
      const phoneReason = getPhoneValidationReason(phoneRaw);
      const normalizedPhone = extractTenDigitMobile(phoneRaw);

      if (phoneReason || !normalizedPhone) {
        invalidLeads.push({
          phone: phoneRaw,
          reason: phoneReason || "Invalid phone number format. Please provide a valid 10-digit Indian mobile number",
          lead_source: leadPartnerName,
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
        invalidLeads.push({
          ...lead,
          phone: normalizedPhone,
          reason: "This phone number already exists in our system",
          lead_source: leadPartnerName,
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
              phone: lead.phone,
              reason: "Unable to process this lead. Please verify the data and try again.",
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

    // Commit the transaction
    await transaction.commit();
    transactionCommitted = true; // Mark as committed

    // Generate meaningful success message
    let successMessage = "";
    if (createdLeads.length === inputData.length) {
      successMessage = isBulk 
        ? `Successfully processed all ${createdLeads.length} lead(s)` 
        : "Lead successfully submitted and processed";
    } else if (createdLeads.length > 0) {
      successMessage = `Successfully processed ${createdLeads.length} out of ${inputData.length} lead(s). ${invalidLeads.length} lead(s) could not be processed.`;
    } else {
      successMessage = `None of the ${inputData.length} lead(s) could be processed. Please review the validation errors.`;
    }

    // Build professional response without exposing internal IDs
    const response = {
      summary: {
        totalReceived: inputData.length,
        successfullyProcessed: createdLeads.length,
        failed: invalidLeads.length,
      },
      ...(createdLeads.length > 0 && {
        processedLeads: createdLeads.map((l) => ({
          name: l.name,
          phone: l.phone,
          email: l.email,
          ...(l.bereau_score && { bureauScore: l.bereau_score }),
          ...(l.utm_campaign && { campaign: l.utm_campaign }),
          status: "processed",
        })),
      }),
      ...(invalidLeads.length > 0 && {
        failedLeads: invalidLeads.map((l) => ({
          phone: l.phone || "N/A",
          reason: l.reason,
        })),
      }),
    };

    // Determine appropriate status code
    // 201 Created: At least one lead was successfully processed
    // 200 OK: No leads were processed (all failed validation)
    const statusCode = createdLeads.length > 0 ? 201 : 200;

    return ApiResponse(
      res,
      "SUCCESS",
      statusCode,
      successMessage,
      response
    );
  } catch (error) {
    // Only rollback if transaction hasn't been committed
    if (transaction && !transactionCommitted) {
      await transaction.rollback();
    }
    console.error("Lead processing error:", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      "An unexpected error occurred while processing your request. Please try again later or contact support if the issue persists.",
      null,
      null // Don't expose internal error details
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
  if (!rawPhone || typeof rawPhone !== "string") {
    return "Phone number is required";
  }
  if (/[a-zA-Z]/.test(rawPhone)) {
    return "Phone number cannot contain letters. Please provide only digits.";
  }

  const cleaned = rawPhone.replace(/[\s-]/g, "");
  const digitsOnly = cleaned.replace(/\D/g, "");

  if (isValidIndianMobile(rawPhone)) return null;

  // User-friendly error messages
  if (digitsOnly.length > 14) {
    return "Phone number has too many digits. Maximum 14 digits allowed (including country code).";
  }
  if (digitsOnly.length < 10) {
    return `Phone number must have 10 digits. Provided number has only ${digitsOnly.length} digit(s).`;
  }

  if (digitsOnly.length === 10 && !/^[6-9]/.test(digitsOnly)) {
    return "Invalid phone number. Indian mobile numbers must start with 6, 7, 8, or 9.";
  }

  if (/^00[^91]/.test(cleaned)) {
    return "Invalid country code. For India, use +91 or 0091 prefix.";
  }
  if (/^\+[^9]/.test(cleaned)) {
    return "Invalid country code. For India, use +91 prefix.";
  }

  // Landline specific checks
  if (/^[02]/.test(digitsOnly)) {
    return "Landline numbers are not accepted. Please provide a valid mobile number.";
  }

  return "Invalid phone number format. Please provide a valid 10-digit Indian mobile number (e.g., 9876543210).";
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
      "x-signature": signature,
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
      error?.message || "Failed to generate headers !",
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
      error?.message || "Failed to fetch all lead partners",
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
      error?.message || "Failed to update lead partner details !",
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
      await transaction.rollback()
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
    await transaction.rollback()
    console.log('error in deleting lead partner = ', error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to delete lead partner !", null, error)
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
