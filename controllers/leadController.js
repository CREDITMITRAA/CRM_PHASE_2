const { Op, where, Sequelize } = require("sequelize");
const moment = require("moment-timezone");
const {
  sequelize,
  Lead,
  InvalidLead,
  User,
  LeadAssignment,
  Activity,
  ActivityLog,
  WalkIn,
} = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const LeadServices = require("../services/leadServices");
const ActivityServices = require("../services/activityServices");
const LoanReportServices = require("../services/loanReportsServices");
const CreditReportServices = require("../services/creditReportsServices");
const {
  ROLE_ADMIN,
  ROLE_MANAGER,
  VERIFICATION_STATUSES,
  ROLE_EMPLOYEE,
  LEAD_STATUSES,
  ROLE_OPERATIONS_TEAM,
} = require("../utilities/constants");
const {
  getErrorReason,
  getUpdatedFields,
  getActivityType,
  formatString,
} = require("../utilities/helper-functions");
const {
  ACTIVITY_TYPES,
  ACTIVITY_LOGS,
  terminologiesMap,
} = require("../utilities/ActivityLogConstants");
const {
  createLogData,
  createActivityLog,
} = require("../services/ActivityLogServices");
const { getIo } = require("../socket/socket");

async function createBulkLeads(req, res) {
  console.log(req.body, "Received leads data");

  const validatePhone = true;
  const validateEmail = false;
  const validateName = false;
  const validateSource = false;

  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return ApiResponse(res, "error", 400, "Invalid input. Please provide an array of leads.");
    }

    let validLeads = [];
    let invalidLeads = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const isValidIndianMobile = (phone) => {
      if (!phone || typeof phone !== 'string') return false;

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
        if (digitsOnly.length === 12 && digitsOnly.startsWith('91') && /^[6-9]/.test(digitsOnly.substring(2))) {
          return true;
        }
        if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.substring(1))) {
          return true;
        }
        // Handle 0091/091 cases (14 digits total for 0091, 13 for 091)
        if ((digitsOnly.startsWith('0091') && digitsOnly.length === 14 && /^[6-9]/.test(digitsOnly.substring(4)))) {
          return true;
        }
        if ((digitsOnly.startsWith('091') && digitsOnly.length === 13 && /^[6-9]/.test(digitsOnly.substring(3)))) {
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
      if (digitsOnly.startsWith('0091') && digitsOnly.length === 14) {
        return digitsOnly.substring(4);
      }
      if (digitsOnly.startsWith('091') && digitsOnly.length === 13) {
        return digitsOnly.substring(3);
      }
      if ((digitsOnly.startsWith('+91') || digitsOnly.startsWith('91')) && digitsOnly.length === 12) {
        return digitsOnly.substring(2);
      }
      if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
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
      if (digitsOnly.length > 14) return "Too many digits (maximum 14 with 0091 prefix)";
      if (digitsOnly.length < 10) return `Only ${digitsOnly.length} digits (need 10)`;

      if (digitsOnly.length === 10 && !/^[6-9]/.test(digitsOnly)) {
        return "Invalid starting digit (must be 6-9)";
      }

      if (/^00[^91]/.test(cleaned)) return "Invalid international prefix";
      if (/^\+[^9]/.test(cleaned)) return "Invalid international prefix";

      // Landline specific checks
      if (/^[02]/.test(digitsOnly)) return "Landline numbers not accepted";

      return "Invalid phone format";
    };

    // Rest of your existing workflow remains the same
    req.body.forEach((lead) => {
      let isValid = true;
      let reason = "";

      const phoneRaw = lead.phone?.toString() || "";
      const phoneReason = getPhoneValidationReason(phoneRaw);

      if (validateName && !lead.name) {
        isValid = false;
        reason = "Missing name";
      } else if (validateEmail && (!lead.email || !emailRegex.test(lead.email))) {
        isValid = false;
        reason = "Invalid email";
      } else if (validateSource && !lead.lead_source) {
        isValid = false;
        reason = "Missing lead source";
      } else if (validatePhone && phoneReason) {
        isValid = false;
        reason = phoneReason;
      }

      let extractedPhone = extractTenDigitMobile(phoneRaw);
      const formattedLead = {
        ...lead,
        original_phone: phoneRaw,
        phone: isValid ? extractedPhone || phoneRaw : phoneRaw,
        last_updated_status: "Not Contacted"
      };

      if (isValid && extractedPhone) {
        validLeads.push(formattedLead);
      } else {
        invalidLeads.push({
          ...formattedLead,
          phone: phoneRaw,
          reason: reason || "Unknown reason",
        });
      }
    });

    // Rest of your existing code for database operations...
    let createdLeads = [];
    if (validLeads.length > 0) {
      try {
        createdLeads = await Lead.bulkCreate(validLeads, { validate: true });
      } catch (bulkError) {
        console.error("Bulk insert error:", bulkError);
        for (const lead of validLeads) {
          try {
            const created = await Lead.create(lead);
            createdLeads.push(created);
          } catch (err) {
            const reason = getErrorReason(err) || "Insert failed";
            invalidLeads.push({ ...lead, phone: lead.original_phone, reason });
            console.error("Insert failed:", err);
          }
        }
      }
    }

    if (invalidLeads.length > 0) {
      try {
        await InvalidLead.bulkCreate(invalidLeads, { validate: false });
      } catch (bulkInvalidErr) {
        console.error("Invalid bulk insert failed:", bulkInvalidErr);
        for (const lead of invalidLeads) {
          try {
            await InvalidLead.create(lead);
          } catch (err) {
            lead.reason = getErrorReason(err) || "Invalid lead insert failed";
            console.error("Single invalid insert failed:", err);
          }
        }
      }
    }

    return ApiResponse(res, "success", 201, "Leads processed successfully", {
      totalValidLeads: createdLeads.length,
      totalInvalidLeads: invalidLeads.length,
      createdLeads: createdLeads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        lead_source: l.lead_source,
      })),
      invalidLeads,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return ApiResponse(res, "error", 500, "Failed to process leads", {
      error: err.message,
    });
  }
}


async function getAllLeadsWithPagination(req, res) {
  try {
    let {
      page = 1,
      pageSize = 10,
      name,
      email,
      phone,
      leadId,
      activity_status,
      employeeName,
      importedOn,
      verification_status,
      assigned_to = "true",
      lead_status,
      assigned_to_name,
      application_status,
      lead_source,
      isPaginationOff = "false",
      last_updated,
      assigned_on,
      for_walk_ins_page = false,
      walk_in_attributes = [],
      user_status = null,
      appointment_date,
      lead_bucket,
      closing_date,
      verification_date,
      is_paid = false,
    } = req.query;

    // const limit = parseInt(req.query.limit) || 50;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    // Default validation to prevent non-integer inputs
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const whereConditions = {};
    let leadAssignmentConditions = {};

    if (
      assigned_to &&
      assigned_to !== "not_assigned" &&
      assigned_to !== "re_assigned"
    ) {
      leadAssignmentConditions = {
        ...leadAssignmentConditions,
        ...(assigned_to !== "true" ? { assigned_to } : {}),
      };
    }

    const includeConditions = [
      {
        model: Activity,
        as: "Activities",
        required: false, // Include only if activity_status filter is provided
        order: [["createdAt", "DESC"]], // Ensure the most recent activity is first
        limit: 1, // Only include the most recent activity
      },
      {
        model: LeadAssignment,
        as: "LeadAssignments",
        required:
          assigned_to === "not_assigned"
            ? false
            : !!assigned_to ||
            !!assigned_to_name ||
            !!assigned_on ||
            !!user_status,
        where: leadAssignmentConditions,
        include: [
          {
            model: User, // Assuming `User` is your `AssignedTo` model
            as: "AssignedTo", // Alias for the related `User` model
            attributes: ["name"], // Only include the name field
          },
        ],
      },
    ];

    if (name) whereConditions.name = { [Op.like]: `%${name}%` };
    if (email) whereConditions.email = { [Op.like]: `%${email}%` };
    if (phone) whereConditions.phone = { [Op.like]: `%${phone}%` };
    if (leadId) whereConditions.id = { [Op.like]: `%${leadId}%` };
    if (activity_status)
      whereConditions.lead_status = { [Op.like]: `%${activity_status}` };
    console.log("verification status = ", verification_status);

    if (verification_status) {
      // Normalize to array if it isn't already
      const statuses = Array.isArray(verification_status)
        ? verification_status
        : [verification_status];

      whereConditions.verification_status = {
        [Op.or]: statuses.map((status) => ({
          [Op.like]: `%${status}%`,
        })),
      };
    }

    if (lead_status) {
      whereConditions.last_updated_status = lead_status;
    }

    if (closing_date) {
      const targetDate = new Date(closing_date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      whereConditions.closing_date = {
        [Op.between]: [startOfDay, endOfDay],
      };
    }

    if (verification_date) {
      const targetDate = new Date(verification_date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      whereConditions.verification_date = {
        [Op.between]: [startOfDay, endOfDay],
      };
    }
    if (!for_walk_ins_page && application_status) {
      whereConditions.application_status = {
        [Op.like]: `%${application_status}%`, // Use Op.iLike for case-insensitivity
      };
    }
    // if (application_status) {
    //   whereConditions.application_status = {
    //     [Op.or]: application_status.map((status) => ({
    //       [Op.like]: `%${status}%`, // Use Op.iLike for case-insensitivity if supported
    //     })),
    //   };
    // }

    if (importedOn) {
      const [startRange, endRange] = importedOn.split(",");
      if (startRange && endRange) {
        const startOfRangeUTC = moment
          .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
        const endOfRangeUTC = moment
          .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
        whereConditions.createdAt = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      } else {
        const startOfDayUTC = moment
          .tz(startRange, "Asia/Kolkata")
          .startOf("day")
          .utc()
          .toDate();
        const endOfDayUTC = moment
          .tz(startRange, "Asia/Kolkata")
          .endOf("day")
          .utc()
          .toDate();
        whereConditions.createdAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    if (last_updated) {
      const [startRange, endRange] = last_updated.split(",");
      if (startRange && endRange) {
        const startOfRangeUTC = moment
          .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
        const endOfRangeUTC = moment
          .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
        whereConditions.updatedAt = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      } else {
        const startOfDayUTC = moment
          .tz(startRange, "Asia/Kolkata")
          .startOf("day")
          .utc()
          .toDate();
        const endOfDayUTC = moment
          .tz(startRange, "Asia/Kolkata")
          .endOf("day")
          .utc()
          .toDate();
        whereConditions.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    // lead source filter if lead_source is provided
    if (lead_source) {
      // whereConditions.lead_source = {
      //   [Op.like]: `%${lead_source}%`, // Use Op.iLike for case-insensitivity
      // }
      whereConditions.lead_source = lead_source;
    }

    const verification_statuses = Array.isArray(verification_status)
      ? verification_status.filter((s) => s !== "")
      : [verification_status].filter((s) => s !== "");

    if (lead_bucket) {
      whereConditions.lead_bucket = lead_bucket;
      if (lead_bucket === "APPROVED_APPLICATIONS") {
        whereConditions.is_paid = {
          [Op.eq]: is_paid === "true",
        };
      } else if (
        lead_bucket === "PRELIMINERY_CHECK" &&
        (!verification_status || verification_statuses.length === 0)
      ) {
        // For PRELIMINARY_CHECK, exclude "Normal Login" but include null and others
        whereConditions[Op.or] = [
          { verification_status: { [Op.notLike]: "Normal Login" } },
          { verification_status: { [Op.eq]: null } },
        ];
      }
    }

    if (assigned_to === "not_assigned") {
      // Check for leads without any assignments
      whereConditions[Op.and] = Sequelize.literal(`
        NOT EXISTS (
          SELECT 1 
          FROM LeadAssignments AS LA 
          WHERE LA.lead_id = Lead.id
        )
      `);
    } else if (assigned_to === "re_assigned") {
      whereConditions.is_reassigned = true;
    } else if (assigned_to || assigned_to_name || assigned_on) {
      // Apply other lead assignment filters
      includeConditions.push({
        model: LeadAssignment,
        as: "LeadAssignments",
        required: true, // INNER JOIN to only get assigned leads
        where: leadAssignmentConditions,
        include: [
          {
            model: User,
            as: "AssignedTo",
            attributes: ["name"],
          },
        ],
      });
    }

    if (assigned_to_name) {
      // Use `Op.like` to filter based on the assigned user's name
      leadAssignmentConditions["AssignedTo.name"] = {
        [Op.like]: `%${assigned_to_name}%`,
      };
    }

    if (assigned_on) {
      const [startRange, endRange] = assigned_on.split(",");

      if (startRange && endRange) {
        const startOfRangeUTC = moment
          .tz(startRange, "YYYY-MM-DD HH:mm", "Asia/Kolkata")
          .startOf("minute")
          .utc()
          .toDate();
        const endOfRangeUTC = moment
          .tz(endRange, "YYYY-MM-DD HH:mm", "Asia/Kolkata")
          .endOf("minute")
          .utc()
          .toDate();

        console.log("Filtered Start UTC:", startOfRangeUTC);
        console.log("Filtered End UTC:", endOfRangeUTC);

        leadAssignmentConditions.updatedAt = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      } else {
        const startOfDayUTC = moment
          .tz(startRange, "YYYY-MM-DD", "Asia/Kolkata")
          .startOf("day")
          .utc()
          .toDate();
        const endOfDayUTC = moment
          .tz(startRange, "YYYY-MM-DD", "Asia/Kolkata")
          .endOf("day")
          .utc()
          .toDate();

        console.log("Filtered Single Day Start UTC:", startOfDayUTC);
        console.log("Filtered Single Day End UTC:", endOfDayUTC);

        leadAssignmentConditions.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    // if (appointment_date) {
    //   const [startDate, endDate] = appointment_date.split(',');

    //   // Convert to UTC dates
    //   const startUTC = moment.tz(startDate, "YYYY-MM-DD HH:mm", "Asia/Kolkata").utc().toDate();
    //   const endUTC = moment.tz(endDate, "YYYY-MM-DD HH:mm", "Asia/Kolkata").utc().toDate();

    //   // Add the walkIns include if not already present
    //   if (for_walk_ins_page) {
    //     includeConditions.push({
    //       model: WalkIn,
    //       as: 'walkIns',
    //       attributes: walk_in_attributes,
    //       required: true,
    //       order: [["id", "DESC"]],
    //       limit: 1,
    //       where: {
    //         [Op.or]: [
    //           {
    //             is_rescheduled: true,
    //             rescheduled_date_time: {
    //               [Op.between]: [startUTC, endUTC]
    //             }
    //           },
    //           {
    //             is_rescheduled: false,
    //             walk_in_date_time: {
    //               [Op.between]: [startUTC, endUTC]
    //             }
    //           },
    //           {
    //             is_rescheduled: null,
    //             walk_in_date_time: {
    //               [Op.between]: [startUTC, endUTC]
    //             }
    //           }
    //         ]
    //       }
    //     });
    //   } else {
    //     // If for_walk_ins_page is true, modify the existing walkIns condition
    //     const walkInInclude = includeConditions.find(inc => inc.as === 'walkIns');
    //     if (walkInInclude) {
    //       walkInInclude.where = {
    //         [Op.or]: [
    //           {
    //             is_rescheduled: true,
    //             rescheduled_date_time: {
    //               [Op.between]: [startUTC, endUTC]
    //             }
    //           },
    //           {
    //             is_rescheduled: false,
    //             walk_in_date_time: {
    //               [Op.between]: [startUTC, endUTC]
    //             }
    //           },
    //           {
    //             is_rescheduled: null,
    //             walk_in_date_time: {
    //               [Op.between]: [startUTC, endUTC]
    //             }
    //           }
    //         ]
    //       };
    //       walkInInclude.required = true;
    //     }
    //   }
    // }

    if (for_walk_ins_page && appointment_date) {
      const [startDate, endDate] = appointment_date.split(",");
      const startUTC = moment
        .tz(startDate, "YYYY-MM-DD HH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endUTC = moment
        .tz(endDate, "YYYY-MM-DD HH:mm", "Asia/Kolkata")
        .utc()
        .toDate();

      // Add a subquery condition to the main where clause
      whereConditions.id = {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT lead_id FROM WalkIns
          WHERE (
            (is_rescheduled = 1 AND rescheduled_date_time BETWEEN '${startUTC.toISOString()}' AND '${endUTC.toISOString()}')
            OR 
            ((is_rescheduled = 0 OR is_rescheduled IS NULL) AND walk_in_date_time BETWEEN '${startUTC.toISOString()}' AND '${endUTC.toISOString()}')
          )
        )`),
      };

      // Keep the include for getting walkIn data, but make it optional
      includeConditions.push({
        model: WalkIn,
        as: "walkIns",
        attributes: walk_in_attributes,
        required: false,
        order: [["id", "DESC"]],
        limit: 1,
      });
    }

    if (for_walk_ins_page) {
      if (!application_status) {
        console.log("application status is not given");

        whereConditions[Op.or] = [
          { application_status: { [Op.notLike]: "Normal Login" } },
          { application_status: { [Op.eq]: null } },
        ];
      } else {
        whereConditions.application_status = {
          [Op.like]: `%${application_status}%`, // Use Op.iLike for case-insensitivity
        };
      }
      // whereConditions[Op.or] = [
      //   { lead_bucket: { [Op.ne]: 'APPROVED_APPLICATIONS' } },
      //   { lead_bucket: { [Op.eq]: null } }
      // ];
      includeConditions.push({
        model: WalkIn,
        as: "walkIns",
        attributes: walk_in_attributes,
        required: false,
        order: [
          // [Sequelize.literal(`COALESCE(rescheduled_date_time, walk_in_date_time)`), "DESC"]
          ["id", "DESC"],
        ],
        limit: 1,
      });
      if (for_walk_ins_page && !application_status) {
        whereConditions[Op.or] = [
          { application_status: { [Op.ne]: "Normal Login" } },
          { application_status: { [Op.eq]: null } },
        ];
        whereConditions[Op.or] = [
          { lead_bucket: { [Op.ne]: "APPROVED_APPLICATIONS" } },
          { lead_bucket: { [Op.eq]: null } },
        ];
      }
    }

    if (user_status === "inactive") {
      leadAssignmentConditions.status = user_status;
    }

    const shouldOrderByUpdatedAt =
      whereConditions?.verification_status ||
      whereConditions?.lead_status ||
      whereConditions?.activity_status;
    const orderConditions = shouldOrderByUpdatedAt
      ? [
        ["updatedAt", "DESC"], // Apply updatedAt sorting if verification_status is included
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ]
      : [
        ["createdAt", "DESC"], // Default ordering
        ["id", "DESC"],
      ];

    const isPaginationEnabled = isPaginationOff === "false";
    const { count, rows } = await Lead.findAndCountAll({
      where: whereConditions,
      include: includeConditions,
      order: orderConditions,
      limit: isPaginationEnabled ? pageSize : null,
      offset: isPaginationEnabled ? (page - 1) * pageSize : null,
      distinct: true,
    });

    let callsStartDate = null;
    let callsEndDate = null;

    if (importedOn) {
      const [start, end] = importedOn.split(",");
      if (start && end) {
        callsStartDate = moment.tz(start, "YYYY-MM-DDTHH:mm", "Asia/Kolkata").utc().toDate();
        callsEndDate = moment.tz(end, "YYYY-MM-DDTHH:mm", "Asia/Kolkata").utc().toDate();
      }
    }

    // SQL to get call count grouped by created_by
    const callCounts = await sequelize.query(
      `SELECT created_by, COUNT(*) as count 
   FROM activities 
   WHERE (:startDate IS NULL OR createdAt >= :startDate) 
     AND (:endDate IS NULL OR createdAt <= :endDate)
   GROUP BY created_by`,
      {
        replacements: {
          startDate: callsStartDate,
          endDate: callsEndDate,
        },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    // Map for quick loopup
    const callCountMap = {};
    callCounts.forEach(({ created_by, count }) => {
      callCountMap[created_by] = parseInt(count);
    });

    
    rows.forEach((lead) => {
      const activity = lead.dataValues?.Activities?.[0];
      const createdBy = activity?.created_by;

      lead.dataValues.calls_count = createdBy ? callCountMap[createdBy] || 0 : 0;
    });


    const totalPages = isPaginationEnabled ? Math.ceil(count / pageSize) : 1;
    let pagination = isPaginationEnabled
      ? {
        page: page,
        totalPages: totalPages,
        total: count,
        pageSize,
      }
      : null;

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Leads fetched successfully",
      rows,
      null,
      pagination
    );
  } catch (error) {
    console.error("Error fetching leads:", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to fetch leads!",
      null,
      error,
      null
    );
  }
}

async function getLeadById(req, res) {
  try {
    const { leadId } = req.params;
    let { includeFields, walk_in_attributes = [] } = req.query;

    includeFields = includeFields ? includeFields.split(",") : null;

    if (!leadId) {
      return ApiResponse(res, "error", 400, "Lead Id is required!");
    }

    let queryOptions = {
      where: { id: leadId },
      attributes: includeFields?.length ? includeFields : undefined,
      include: [], // Initialize empty include array
    };

    if (!includeFields) {
      queryOptions.include.push({
        model: Activity,
        as: "Activities",
        attributes: [
          "id",
          "activity_status",
          "docs_collected",
          "description",
          "createdAt",
          "follow_up",
        ],
        required: false,
      });

      // Add LeadAssignments inclusion
      queryOptions.include.push({
        model: LeadAssignment,
        as: "LeadAssignments",
        required: false, // INNER JOIN to only get assigned leads
        include: [
          {
            model: User,
            as: "AssignedTo",
            attributes: ["name"],
          },
        ],
      });
    }

    if (walk_in_attributes.length > 0) {
      queryOptions.include.push({
        model: WalkIn,
        as: "walkIns",
        attributes: walk_in_attributes,
        required: false,
        order: [["id", "DESC"]],
        limit: 1,
      });
    }

    // Fetch the lead by ID along with related data (activities and lead assignments)
    const lead = await Lead.findOne(queryOptions);

    // Check if the lead is found
    if (!lead) {
      return ApiResponse(res, "error", 400, "Lead not found!");
    }

    // Sort activities in JavaScript: first by createdAt in descending order, then by id in descending order
    if (lead.Activities && lead.Activities.length > 0) {
      lead.Activities.sort((a, b) => {
        // Sort by createdAt descending
        if (new Date(b.createdAt) - new Date(a.createdAt) !== 0) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        // If createdAt is the same, sort by id descending
        return b.id - a.id;
      });
    }

    // Return the lead data including activities and assignments
    return ApiResponse(res, "success", 200, "Lead fetched successfully", lead);
  } catch (error) {
    console.error("Error fetching lead by ID:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Internal server error",
      null,
      error.message
    );
  }
}

async function updateLeadReportsActivities(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      userId,
      leadId,
      lead,
      loanReports,
      creditReports,
      activity,
      application_status,
      lead_status,
      role,
      rejection_reason,
      verification_status,
      docsCollectedPayload,
      lead_name,
    } = req.body;

    // Validate if user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "User Not Found!", null, null, null);
    }

    // Validate role and application_status
    if (application_status && role !== ROLE_ADMIN && role !== ROLE_MANAGER) {
      await transaction.rollback();
      return ApiResponse(res, "error", 403, "Unauthorized Access!");
    }

    const validApplicationStatuses = [
      "Manager 1 Approved",
      "Manager 2 Approved",
      "Rejected",
      "Closed",
      "Login",
    ];

    if (application_status && !validApplicationStatuses.includes(application_status)) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Invalid Application Status!");
    }

    // If application_status is provided, validate lead status
    if (application_status && verification_status !== "12 documents collected") {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Application Status Cannot be Updated Now!");
    }

    // Define the update data for lead
    let updatedLead = null;
    const updateData = {};

    // 1. Update the Lead if the data is provided
    if (lead) {
      updatedLead = await LeadServices.updateLead(leadId, lead, transaction);
      let updatedFields = getUpdatedFields(
        ({
          name,
          email,
          city,
          salary,
          company,
          company_category_name,
          lead_source,
          bereau_name,
          bereau_score,
        } = lead),
        lead.prev_data
      );
      const activityLogs = Object.keys(updatedFields).map((field) => ({
        created_by: userId,
        activity_type: getActivityType(field),
        activity_desc: `${formatString(field)} updated from "${
          updatedFields[field].oldValue
          }" to "${updatedFields[field].newValue}"`,
        lead_id: leadId,
        lead_name: lead_name,
        status: "active",
      }));
      await ActivityLog.bulkCreate(activityLogs, { transaction });
    }

    // 2. Update application status if provided
    if (application_status) {
      updateData.application_status = application_status;
      updateData.last_updated_status = application_status; // Update last_updated_status

      // Handle rejection reason if application status is "Rejected"
      if (application_status === "Rejected") {
        if (!rejection_reason) {
          await transaction.rollback();
          return ApiResponse(res, "error", 400, "Rejection reason is required!");
        }
        updateData.is_rejected = true;
        updateData.rejection_reason = rejection_reason;
        updateData.rejected_by_id = userId;
        updateData.rejected_at = new Date();
      } else {
        // If the application status is not Rejected, set is_rejected to false and rejection_reason to null
        updateData.is_rejected = false;
        updateData.rejection_reason = null;
        updateData.rejected_by_id = null;
        updateData.rejected_at = null;
      }
      await LeadServices.updateLead(leadId, updateData, transaction);

      let logData = createLogData(
        ACTIVITY_LOGS.APPLICATION_STATUS_UPDATE(application_status),
        ACTIVITY_TYPES.APPLICATION_STATUS_UPDATE,
        userId,
        leadId,
        null,
        lead_name
      );
      await createActivityLog(logData, transaction);
    }

    let createdLoanReports = [];
    let createdCreditReports = [];
    let createdActivity = null;

    // 3. Create Loan Reports if provided
    if (loanReports && loanReports.length > 0) {
      createdLoanReports = await LoanReportServices.createLoanReports(
        loanReports,
        transaction
      );
      const activityLogs = loanReports.map((LoanReport) => ({
        created_by: userId,
        activity_type: ACTIVITY_TYPES.LOAN_REPORTS_UPDATE,
        activity_desc: ACTIVITY_LOGS.LOAN_REPORTS_UPDATE(
          LoanReport.loan_type,
          LoanReport.bank_name,
          LoanReport.loan_amount,
          LoanReport.emi,
          LoanReport.emi_date,
          LoanReport.outstanding
        ),
        lead_id: leadId,
        lead_name: lead_name,
        status: "active",
      }));
      await ActivityLog.bulkCreate(activityLogs, { transaction });
    }

    // 4. Create Credit Reports if provided
    if (creditReports && creditReports.length > 0) {
      createdCreditReports = await CreditReportServices.createCreditReports(
        creditReports,
        transaction
      );
      const activityLogs = creditReports.map((CreditReport) => ({
        created_by: userId,
        activity_type: ACTIVITY_TYPES.CREDIT_REPORTS_UPDATE,
        activity_desc: ACTIVITY_LOGS.CREDIT_REPORTS_UPDATE(
          CreditReport.credit_card_name,
          CreditReport.total_outstanding
        ),
        lead_id: leadId,
        lead_name: lead_name,
        status: "active",
      }));
      await ActivityLog.bulkCreate(activityLogs, { transaction });
    }

    // 5. Add Activity if provided
    if (activity) {
      let pendingActivity = null;
      if (
        ["Follow Up", "Call Back", "Scheduled Call With Manager"].includes(
          activity.activity_status
        )
      ) {
        pendingActivity = await Activity.findOne({
          where: {
            lead_id: leadId,
            activity_status: [
              "Follow Up",
              "Call Back",
              "Scheduled Call With Manager",
            ],
            task_status: { [Op.ne]: "Completed" },
          },
          transaction,
        });
      }

      if (pendingActivity) {
        await transaction.rollback();
        return ApiResponse(
          res,
          "error",
          400,
          "Previous task is pending! Please complete it before adding a new task."
        );
      }
      createdActivity = await ActivityServices.addActivity(activity, transaction);

      // Prepare lead update data
      const leadUpdateData = {
        lead_status: activity.activity_status,
        last_updated_status: activity.activity_status // Always update last_updated_status
      };

      // Special handling for verification statuses
      if (activity.activity_status.includes("Verification")) {
        leadUpdateData.verification_status = activity.activity_status;
        leadUpdateData.verification_date = new Date();
      }

      // Special handling for login status
      if (activity.activity_status === "Login") {
        leadUpdateData.login_date = new Date();
      }

      await LeadServices.updateLead(leadId, leadUpdateData, transaction);

      let logData = null;
      let logDataForDocsCollected = null;
      if (
        ["Follow Up", "Call Back", "Scheduled Call With Manager"].includes(
          activity.activity_status
        )
      ) {
        let logDataForTask = createLogData(
          ACTIVITY_LOGS.TASK_CREATE(activity.activity_status, activity.follow_up),
          ACTIVITY_TYPES.TASK_CREATE,
          userId,
          leadId,
          activity.description,
          lead_name
        );
        logData = createLogData(
          ACTIVITY_LOGS.LEAD_STATUS_UPDATE(activity.prev_status, activity.activity_status),
          ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
          userId,
          leadId,
          activity.description,
          lead_name
        );
        await createActivityLog(logDataForTask, transaction);
        logDataForDocsCollected = createLogData(
          ACTIVITY_LOGS.DOCUMENTS_COLLECTED(activity.docs_collected),
          ACTIVITY_TYPES.DOCUMENTS_COLLECTED,
          activity.userId,
          activity.lead_id,
          null,
          lead_name
        );
      } else {
        logData = createLogData(
          ACTIVITY_LOGS.LEAD_STATUS_UPDATE(activity.prev_status, activity.activity_status),
          ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
          userId,
          leadId,
          activity.description,
          lead_name
        );
        logDataForDocsCollected = createLogData(
          ACTIVITY_LOGS.DOCUMENTS_COLLECTED(activity.docs_collected),
          ACTIVITY_TYPES.DOCUMENTS_COLLECTED,
          activity.userId,
          activity.lead_id,
          null,
          lead_name
        );
      }

      if (activity.docs_collected !== activity.prev_docs_collected) {
        await createActivityLog(logDataForDocsCollected, transaction);
      }
      await createActivityLog(logData, transaction);
    }

    if (docsCollectedPayload) {
      await ActivityServices.updateDocsCollectedByActivityId(
        docsCollectedPayload,
        transaction
      );

      // If docs collected changes verification status, update relevant fields
      if (docsCollectedPayload.docs_collected === "12 documents collected") {
        await LeadServices.updateLead(
          leadId,
          {
            verification_status: docsCollectedPayload.docs_collected,
            last_updated_status: docsCollectedPayload.docs_collected,
            verification_date: new Date()
          },
          transaction
        );
      }

      let logData = createLogData(
        ACTIVITY_LOGS.DOCUMENTS_COLLECTED(docsCollectedPayload.docs_collected),
        ACTIVITY_TYPES.DOCUMENTS_COLLECTED,
        userId,
        leadId,
        null,
        lead_name
      );
      await createActivityLog(logData, transaction);
    }

    // Commit the transaction after all operations
    await transaction.commit();

    // Return the response with updated data
    return ApiResponse(
      res,
      "success",
      200,
      "Details updated successfully!",
      {
        updatedLead,
        createdLoanReports,
        createdCreditReports,
        createdActivity,
      },
      null,
      null
    );
  } catch (error) {
    // Rollback transaction on error
    if (transaction) await transaction.rollback();
    console.error("Error in updating lead and adding reports:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update details!",
      null,
      error,
      null
    );
  }
}

async function updateVerificationStatus(req, res) {
  const io = getIo();
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const {
      lead_id,
      verification_status,
      role,
      rejection_reason,
      rejected_by_id,
      verification_status_note,
      user_id,
      lead_name,
      assigned_to,
    } = req.body;

    if (!lead_id || !verification_status || !role) {
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    if (role !== ROLE_ADMIN && role !== ROLE_MANAGER) {
      return ApiResponse(
        res,
        "error",
        403,
        "You are not allowed to update verification status!",
        null,
        null,
        null
      );
    }

    const validStatuses = [
      "Under Review",
      "On Hold",
      "Manager 1 Approved",
      "Manager 2 Approved",
      "Approved for Walk-In",
      "Rejected",
    ];
    if (!VERIFICATION_STATUSES.includes(verification_status)) {
      return ApiResponse(res, "error", 400, "Invalid verification status!");
    }

    let updateData = {
      verification_status,
      last_updated_status: verification_status,
    };
    if (verification_status === "Rejected") {
      if (!rejection_reason || !rejected_by_id) {
        return ApiResponse(
          res,
          "error",
          400,
          "Rejection reason and Rejected by id is required !"
        );
      }
      // updateData.application_status = verification_status
      updateData.is_rejected = true;
      updateData.rejection_reason = rejection_reason;
      updateData.rejected_by_id = rejected_by_id;
      updateData.rejected_at = moment().format("YYYY-MM-DD HH:mm:ss");
      updateData.updated_by = user_id;
    } else {
      updateData.verification_status_note = verification_status_note;
      updateData.application_status = null;
      updateData.is_rejected = false;
      updateData.rejection_reason = null;
      updateData.rejected_by_id = null;
      updateData.rejected_at = null;
      updateData.updated_by = user_id;
    }
    // Update lead
    const updatedLead = await LeadServices.updateLead(
      lead_id,
      updateData,
      transaction
    );

    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.VERIFICATION_STATUS_UPDATE,
        activity_desc:
          ACTIVITY_LOGS.VERIFICATION_STATUS_UPDATE(verification_status),
        lead_id: lead_id,
        note:
          verification_status === "Rejected"
            ? rejection_reason
            : verification_status_note,
        lead_name: lead_name,
      },
      { transaction }
    );

    await transaction.commit();

    if (verification_status === "Manager 2 Approved") {
      io.to(`user_${assigned_to}`).emit("lead_approved", {
        message: "Awesome job! Your lead is approved—keep them coming!",
      });
    }

    if (verification_status === "Rejected") {
      io.to(`user_${assigned_to}`).emit("lead_rejected", {
        message:
          "Stay positive! Your approval will come soon—just keep pushing forward",
      });
    }

    return ApiResponse(
      res,
      "success",
      200,
      "Lead updated successfully",
      updatedLead,
      null,
      null
    );
  } catch (error) {
    if (transaction) await transaction.rollback(); // Rollback transaction if initialized
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update verification status!",
      null,
      error,
      null
    );
  }
}

async function getTotalLeadsCount(req, res) {
  try {
    const {
      status = "active",
      lead_status,
      verification_status,
      today = "false",
      assigned_to,
    } = req.query;

    let leadConditions = {};
    let assignmentConditions = {};

    if (status) leadConditions.status = { [Op.like]: `%${status}%` };
    if (lead_status)
      leadConditions.lead_status = { [Op.like]: `%${lead_status}%` };
    if (verification_status)
      leadConditions.verification_status = {
        [Op.like]: `%${verification_status}%`,
      };

    // Filters for LeadAssignment
    if (assigned_to) assignmentConditions.assigned_to = assigned_to;

    // Handle 'today' filter: Convert IST to UTC
    if (today === "true") {
      // Get today's date in IST
      const todayStartIST = moment.tz("Asia/Kolkata").startOf("day").toDate();
      const todayEndIST = moment.tz("Asia/Kolkata").endOf("day").toDate();

      // Convert to UTC
      const todayStartUTC = moment(todayStartIST).utc().toDate();
      const todayEndUTC = moment(todayEndIST).utc().toDate();

      console.log("Date range in UTC:", todayStartUTC, todayEndUTC);

      if (assigned_to) {
        // Apply to LeadAssignment's `createdAt` if `assigned_to` is provided
        assignmentConditions.updatedAt = {
          [Op.between]: [todayStartUTC, todayEndUTC],
        };
      } else {
        // Apply date range to Lead's `createdAt`
        leadConditions.createdAt = {
          [Op.between]: [todayStartUTC, todayEndUTC],
        };
      }
    }

    let totalLeads = 0;

    if (assigned_to) {
      // Count leads based on assigned_to and today filters in LeadAssignment
      totalLeads = await LeadAssignment.count({
        where: assignmentConditions,
        include: [
          {
            model: Lead,
            as: "Lead", // Ensure this matches the alias in your model associations
            where: leadConditions, // Apply Lead filters here
          },
        ],
      });
    } else {
      // Otherwise, count directly from the Lead table
      totalLeads = await Lead.count({
        where: leadConditions,
      });
    }

    console.log("Total leads count:", totalLeads);

    // Return the response
    return ApiResponse(
      res,
      "success",
      200,
      "Leads count fetched successfully",
      totalLeads === 0 ? totalLeads.toString() : totalLeads,
      null,
      null
    );
  } catch (error) {
    console.error("Error fetching leads count:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch total leads count!",
      null,
      error,
      null
    );
  }
}

async function updateApplicationStatus(req, res) {
  const io = getIo();
  const transaction = await sequelize.transaction();
  try {
    const {
      lead_id,
      application_status,
      lead_status,
      role,
      rejection_reason,
      application_status_note,
      rejected_by_id,
      user_id,
      lead_name,
      assigned_to,
      closing_date,
      login_date,
      lead_bucket,
    } = req.body;

    if (!lead_id || !application_status || !lead_status || !role) {
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    if (
      role !== ROLE_ADMIN &&
      role !== ROLE_MANAGER &&
      role !== ROLE_OPERATIONS_TEAM
    ) {
      return ApiResponse(res, "error", 403, "Unauthorized Access !");
    }

    const validApplicationStatuses = [
      "Manager 1 Approved",
      "Manager 2 Approved",
      "Rejected",
      "Closed",
      "Login",
      "Normal Login",
      "Application Approved",
      "Closing Date Changed",
      "Advance Amount Paid",
      "Closing Amount Paid",
      "Others",
      "Loans Disbursed From Bank",
      "Application Closed",
      "Login Date Changed",
      "Maker Approved",
      "Checker Approved"
    ];

    if (!validApplicationStatuses.includes(application_status)) {
      return ApiResponse(res, "error", 400, "Invalid Appliation Status !");
    }

    if (lead_status !== "12 documents collected") {
      if (lead_bucket !== "APPROVED_APPLICATIONS") {
        return ApiResponse(
          res,
          "error",
          400,
          "Application Status Cannot Updated Now !"
        );
      }
    }

    const updateData = {
      application_status,
      last_updated_status: application_status,
    };

    if (application_status === "Rejected") {
      if (!rejection_reason) {
        return ApiResponse(res, "error", 400, "Rejection reason is required !");
      }
      updateData.is_rejected = true;
      updateData.rejection_reason = rejection_reason;
      updateData.rejected_by_id = rejected_by_id;
      updateData.rejected_at = moment().format("YYYY-MM-DD HH:mm:ss");
      updateData.updated_by = user_id;
    } else if (application_status === "Application Approved") {
      if (!closing_date || !lead_bucket) {
        return ApiResponse(res, "error", 400, "Missing required fields !");
      }
      updateData.closing_date = closing_date;
      // updateData.verification_date = verification_date
      updateData.application_status = application_status;
      updateData.lead_bucket = lead_bucket;
    } else if (application_status === "Closing Date Changed") {
      updateData.closing_date = closing_date;
      // updateData.verification_date = verification_date
      updateData.application_status = application_status;
    } else if (
      [
        "Advance Amount Paid",
        "Closing Amount Paid",
        "Login Date Changed",
      ].includes(application_status)
    ) {
      if (!login_date) {
        if (transaction) await transaction.rollback();
        return ApiResponse(res, "error", 400, "Login date is required !");
      }
      updateData.login_date = login_date;
      updateData.is_paid = true;
      updateData.application_status = application_status;
    } else {
      // If the application status is not Rejected, set is_rejected to false and rejection_reason to null
      updateData.application_status_note = application_status_note;
      updateData.is_rejected = false;
      updateData.rejection_reason = null;
      updateData.rejected_by_id = null;
      updateData.rejected_at = null;
      updateData.updated_by = user_id;
    }

    const updatedLead = await LeadServices.updateLead(
      lead_id,
      updateData,
      transaction
    );
    const specialStatuses = [
      "Advance Amount Paid",
      "Closing Amount Paid",
      "Login Date Changed",
    ];
    const activity_desc =
      application_status === "Closing Date Changed"
        ? `Updated Application Status to : ${terminologiesMap.get(
          application_status
        )} (closing date ${closing_date})`
        : specialStatuses.includes(application_status)
          ? `Updated Application Status to : ${terminologiesMap.get(
            application_status
          )} (Login Date : ${login_date})`
          : `Updated Application Status to : ${terminologiesMap.get(
            application_status
          )}`;

    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.APPLICATION_STATUS_UPDATE,
        // activity_desc: application_status === "Closing Date Changed" ? `Updated Application Status to : ${terminologiesMap.get(application_status)} ( closing date ${closing_date} )` : `Updated Application Status to : ${terminologiesMap.get(application_status)}`,
        activity_desc: activity_desc,
        lead_id: lead_id,
        note:
          application_status === "Rejected"
            ? rejection_reason
            : application_status_note,
        lead_name: lead_name,
      },
      { transaction }
    );

    await transaction.commit();
    if (application_status === "Checker Approved") {
      io.to(`user_${assigned_to}`).emit("lead_approved", {
        message: "Awesome job! Your lead is approved—keep them coming!",
      });
    }

    if (application_status === "Rejected") {
      io.to(`user_${assigned_to}`).emit("lead_rejected", {
        message:
          "Stay positive! Your approval will come soon—just keep pushing forward",
      });
    }

    return ApiResponse(
      res,
      "success",
      200,
      "Lead updated with application status successfully.",
      updatedLead,
      null,
      null
    );
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.log(error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update application status !",
      null,
      error,
      null
    );
  }
}

async function updateLeadStatus(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      lead_id,
      lead_status,
      role,
      lead_name,
      prev_lead_status,
      user_id,
      others_note,
      verification_date,
    } = req.body;

    if (!lead_id || !lead_status || !role) {
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    if (![ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM].includes(role)) {
      return ApiResponse(
        res,
        "error",
        403,
        "Only Admin or Employee can change lead status !"
      );
    }

    if (!LEAD_STATUSES.includes(lead_status)) {
      return ApiResponse(res, "error", 400, "Invalid Appliation Status !");
    }

    if (lead_status === "Others" && !others_note) {
      return ApiResponse(
        res,
        "error",
        400,
        "Please provide reason for Others status !"
      );
    }

    let updatedLead = null;
    const updatePayload = {
      lead_status: lead_status,
      last_updated_status: lead_status,
      others_note: lead_status === "Others" ? others_note : undefined,
    };

    // If not "Verification 1", include `lead_status`
    // if (prev_lead_status !== "Verification 1") {
    //   updatePayload.lead_status = lead_status;
    // }

    // Add `verification_date` if `lead_status` is between the two values
    if (["All Clear", "Negative Transaction"].includes(lead_status)) {
      updatePayload.verification_date = verification_date;
    }

    updatedLead = await LeadServices.updateLead(
      lead_id,
      updatePayload,
      transaction
    );

    let logData = createLogData(
      ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
        prev_lead_status,
        lead_status,
        verification_date
      ),
      ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
      user_id,
      lead_id,
      others_note,
      lead_name
    );
    await createActivityLog(logData, transaction);

    await transaction.commit();

    return ApiResponse(
      res,
      "success",
      200,
      "Lead with new lead status updated successfully.",
      updatedLead,
      null,
      null
    );
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.log(error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update lead status !",
      null,
      error,
      null
    );
  }
}

async function getAllDistinctLeadSources(req, res) {
  try {
    let [leadSources] = await sequelize.query(
      `SELECT DISTINCT lead_source AS lead_source FROM ${process.env.DB_NAME}.Leads WHERE lead_source IS NOT NULL;`
    );
    leadSources = leadSources.map((row) => row.lead_source);
    return ApiResponse(
      res,
      "success",
      200,
      "Lead Sources fetched successfully.",
      leadSources
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch lead sources !",
      null,
      error,
      null
    );
  }
}

async function getLeadSourceByName(req, res) {
  try {
    const { lead_source_name } = req.query;

    if (!lead_source_name) {
      return ApiResponse(res, "error", 400, "Lead Source Name is required !");
    }

    let [leadSources] = await sequelize.query(
      `SELECT DISTINCT lead_source AS lead_source
       FROM ${process.env.DB_NAME}.Leads
       WHERE lead_source LIKE :leadSourceName AND lead_source IS NOT NULL;`,
      {
        replacements: { leadSourceName: `%${lead_source_name}%` }, // Allow partial matching
      }
    );

    leadSources = leadSources.map((row) => row.lead_source);

    return ApiResponse(
      res,
      "success",
      200,
      "Lead Sources fetched successfully",
      leadSources
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch lead source by name !",
      null,
      error,
      null
    );
  }
}

async function updateLeadDetails(req, res) {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { user_id, lead_name } = req.body;

    if (!id) {
      return ApiResponse(res, "error", 400, "Lead ID is required!");
    }

    if (Object.keys(req.body).length === 0) {
      return ApiResponse(res, "error", 400, "Update details are required!");
    }

    const lead = await Lead.findOne({ where: { id }, transaction });

    if (!lead) {
      await transaction.rollback();
      return ApiResponse(res, "error", 404, "Lead not found!");
    }

    const prev_lead_data = { ...lead.dataValues };

    // Handle alternate_phones update
    if (req.body.alternate_phones) {
      if (!Array.isArray(req.body.alternate_phones)) {
        await transaction.rollback();
        return ApiResponse(
          res,
          "error",
          400,
          "alternate_phones must be an array!"
        );
      }

      // Filter out empty strings and null values
      const cleanedPhones = req.body.alternate_phones.filter(
        (phone) => phone && phone.trim() !== ""
      );

      // Remove duplicates
      req.body.alternate_phones = [...new Set(cleanedPhones)];
    }

    const [updatedRowCount] = await Lead.update(req.body, {
      where: { id },
      transaction,
      returning: true,
    });

    if (updatedRowCount === 0) {
      await transaction.rollback();
      return ApiResponse(res, "error", 404, "Lead not found!");
    }

    const updatedLead = await Lead.findOne({
      where: { id },
      transaction,
      attributes: { exclude: ["password"] },
    });

    let logMessages = [];
    for (const key in req.body) {
      const prevValue = prev_lead_data[key];
      const newValue = updatedLead[key];

      if (JSON.stringify(prevValue) !== JSON.stringify(newValue)) {
        logMessages.push(`${key} changed from '${prevValue}' to '${newValue}'`);
      }
    }

    if (logMessages.length > 0) {
      let logData = createLogData(
        `Lead details updated: ${logMessages.join(", ")}`,
        ACTIVITY_TYPES.LEAD_UPDATE,
        user_id,
        id,
        null,
        lead_name
      );
      await createActivityLog(logData, transaction);
    }

    await transaction.commit();
    return ApiResponse(
      res,
      "success",
      200,
      "Lead updated successfully!",
      updatedLead
    );
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating lead:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update lead details!",
      null,
      error
    );
  }
}

async function getAllLeadsOfExEmployees(req, res) {
  try {
    let { page = 1, pageSize = 10 } = req.query;

    page = parseInt(page);
    pageSize = parseInt(pageSize);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const { count, rows } = await Lead.findAndCountAll({
      include: [
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          where: { status: "inactive" },
          include: [
            {
              model: User,
              as: "AssignedTo",
              attributes: ["id", "name", "status"], // Only select necessary fields
            },
          ],
        },
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });

    const totalPages = Math.ceil(count / pageSize);

    let pagination = {
      page: page,
      totalPages: totalPages,
      total: count,
      pageSize,
    };

    return ApiResponse(
      res,
      "success",
      200,
      "Leads Fetched Successfully !",
      rows,
      null,
      pagination
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch ex-emp leads !",
      null,
      error,
      null
    );
  }
}

async function uploadLead(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      name,
      phone,
      email,
      loan_amount,
      lead_source,
      loan_type,
      client_secret,
      bereau_score,
      city,
      bereau_name,
    } = req.body;
    if (client_secret !== "SQ") {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Un-Authorized Access !");
    }

    if (!name || !phone || !lead_source || !loan_type) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    const leadFromDB = await Lead.findOne({ where: { phone }, transaction });

    if (leadFromDB) {
      const prev_lead_data = leadFromDB.toJSON();
      // Update current lead source
      leadFromDB.lead_source = lead_source;

      // Update previous sources array
      const prevSources = leadFromDB.prev_lead_sources || [];
      const updatedSources = [lead_source, ...prevSources];
      leadFromDB.prev_lead_sources = updatedSources;

      leadFromDB.visit_count = (leadFromDB.visit_count || 0) + 1;
      leadFromDB.product = loan_type;
      if (loan_amount) leadFromDB.loan_amount = loan_amount;
      if (bereau_score) leadFromDB.bereau_score = bereau_score;
      if (bereau_name) leadFromDB.bereau_name = bereau_name;
      if (city) leadFromDB.city = city;
      // if (email) leadFromDB.email = email;

      await leadFromDB.save({ transaction });

      const updatedLead = leadFromDB.toJSON()
      let logMessages = []

      for (const key in req.body) {
  const prevValue = prev_lead_data[key];
  const newValue = updatedLead[key];

  if (
    prevValue != null &&
    newValue != null &&
    String(prevValue) !== String(newValue)
  ) {
    logMessages.push(`${key} changed from '${prevValue}' to '${newValue}'`);
  }
}

      if(logMessages.length > 0){
        let logData = createLogData(
          `Lead details updated: ${logMessages.join(", ")}`,
          ACTIVITY_TYPES.LEAD_UPDATE,
          0,
          leadFromDB.id,
          null,
          leadFromDB.name
        )
        await createActivityLog(logData, transaction)
      }

      await transaction.commit();
      return ApiResponse(res, "success", 201, "Lead updated successfully!");
    } else {
      let leadToBeSaved = { ...req.body, product: loan_type, last_updated_status: "Not Contacted" };
      const savedLead = await Lead.create(leadToBeSaved, { transaction });
      await transaction.commit();
      return ApiResponse(
        res,
        "success",
        201,
        "Lead uploaded successfully!",
        savedLead
      );
    }
  } catch (error) {
    await transaction.rollback();
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to upload lead!",
      null,
      error
    );
  }
}

async function addNewLead(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { name, email, phone, source } = req.body;

    // Validate mandatory fields
    if (!name || !phone || !source) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Name, Phone, and Source are required fields!");
    }

    // Check if lead already exists
    const existingLead = await Lead.findOne({ where: { phone }, transaction });
    if (existingLead) {
      await transaction.rollback();
      return ApiResponse(res, "error", 409, "Lead with this phone already exists.");
    }

    // Create new lead
    const newLead = await Lead.create(
      {
        name,
        email,
        phone,
        lead_source: source,
        last_updated_status: "Not Contacted",
      },
      { transaction }
    );

    await transaction.commit();
    return ApiResponse(res, "success", 201, "Lead added successfully!", newLead);

  } catch (error) {
    await transaction.rollback();
    return ApiResponse(res, "error", 500, "Failed to add lead!", null, error);
  }
}


module.exports = {
  createBulkLeads,
  getAllLeadsWithPagination,
  getLeadById,
  updateLeadReportsActivities,
  updateVerificationStatus,
  getTotalLeadsCount,
  updateApplicationStatus,
  updateLeadStatus,
  getAllDistinctLeadSources,
  getLeadSourceByName,
  updateLeadDetails,
  getAllLeadsOfExEmployees,
  uploadLead,
  addNewLead
};
