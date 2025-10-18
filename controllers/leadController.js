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
  CreditReport,
  LoanReport,
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
  LOGINS,
  NORMAL_LOGIN,
  PAID,
  LOGIN_BANK_1,
  LOGIN_BANK_2,
  LOGIN_BANK_3,
  LOGIN_BANK_4,
  LOGIN_BANK_5,
  LOGIN_BANK_6,
  UNDER_PROCESS,
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
const { default: axios } = require("axios");
const { saveNotification } = require("../services/NotificationServices");

async function createBulkLeads(req, res) {
  const transaction = await sequelize.transaction();
  console.log(req.body, "Received leads data");

  const validatePhone = true;
  const validateEmail = false;
  const validateName = false;
  const validateSource = false;
  const BATCH_SIZE = 1000;
  const LOG_BATCH_SIZE = 500;

  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return ApiResponse(
        res,
        "error",
        400,
        "Invalid input. Please provide an array of leads."
      );
    }

    const userId = req.query?.userId;
    const userName = req.query?.userName;
    if (!userId) {
      return ApiResponse(
        res,
        "error",
        400,
        "User ID is required for activity logging"
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let allInvalidLeads = [];
    let allCreatedLeads = [];
    let allUpdatedLeads = [];
    let bulkActivityLogs = [];
    let processedCount = 0;

    // Process in batches
    for (let i = 0; i < req.body.length; i += BATCH_SIZE) {
      const batch = req.body.slice(i, i + BATCH_SIZE);
      let validLeads = [];
      let invalidLeads = [];

      // Validate each lead
      for (const lead of batch) {
        let isValid = true;
        let reason = "";

        const phoneRaw = lead.phone?.toString() || "";
        const phoneReason = getPhoneValidationReason(phoneRaw);

        if (validateName && !lead.name) {
          isValid = false;
          reason = "Missing name";
        } else if (
          validateEmail &&
          (!lead.email || !emailRegex.test(lead.email))
        ) {
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
          last_updated_status: "Not Contacted",
        };

        if (lead.bereau_score) {
          formattedLead.bereau_name = lead.bereau_name || "TransUnion Cibil";
        }

        if (!isValid || !extractedPhone) {
          invalidLeads.push({
            ...formattedLead,
            phone: phoneRaw,
            reason: reason || "Unknown reason",
          });
        } else {
          validLeads.push(formattedLead);
        }
      }

      // Existing leads lookup
      const phoneNumbers = validLeads.map((l) => l.phone).filter(Boolean);
      const existingLeads =
        phoneNumbers.length > 0
          ? await Lead.findAll({
              where: { phone: phoneNumbers },
              attributes: [
                "id",
                "phone",
                "name",
                "email",
                "lead_source",
                "bereau_score",
                "utm_campaign",
                "utm_source",
                "lead_status",
              ],
              include: [
                {
                  model: LeadAssignment,
                  as: "LeadAssignments",
                  attributes: ["id", "assigned_to"],
                  required: false,
                },
              ],
              transaction,
            })
          : [];

      const existingLeadsMap = new Map(existingLeads.map((l) => [l.phone, l]));
      const leadsToCreate = [];
      const leadsToUpdate = [];

      for (const lead of validLeads) {
        const existingLead = existingLeadsMap.get(lead.phone);
        if (existingLead) {
          leadsToUpdate.push({
            lead,
            existingId: existingLead.id,
            existingValues: existingLead.get({ plain: true }),
          });
        } else {
          leadsToCreate.push(lead);
        }
      }

      // Create new leads
      let batchCreatedLeads = [];
      if (leadsToCreate.length > 0) {
        try {
          batchCreatedLeads = await Lead.bulkCreate(leadsToCreate, {
            validate: true,
            returning: true,
          });
        } catch (bulkError) {
          console.error("Bulk create error:", bulkError);
          for (const lead of leadsToCreate) {
            try {
              const created = await Lead.create(lead);
              batchCreatedLeads.push(created);
            } catch (err) {
              allInvalidLeads.push({
                ...lead,
                phone: lead.original_phone,
                reason: getErrorReason(err) || "Insert failed",
              });
            }
          }
        }
      }

      // Update existing leads
      let batchUpdatedLeads = [];
      if (leadsToUpdate.length > 0) {
        const assignedLeadsMap = new Map();
        const updatePromises = leadsToUpdate.map(
          async ({ lead, existingId, existingValues }) => {
            try {
              const updateData = {
                name: lead.name,
                email: lead.email,
                lead_source: lead.lead_source,
                bereau_score: lead.bereau_score,
                utm_campaign: lead.utm_campaign,
                utm_source: lead.utm_source,
                lead_status: "Re Engaged",
                last_updated_status: "Re Engaged",
                updated_at: new Date(),
              };

              // Detect changes
              const changedFields = {};
              Object.keys(updateData).forEach((key) => {
                if (!isEqual(existingValues[key], updateData[key])) {
                  changedFields[key] = {
                    previous: existingValues[key],
                    current: updateData[key],
                  };
                }
              });

              if (Object.keys(changedFields).length > 0) {
                const [affectedCount] = await Lead.update(updateData, {
                  where: { id: existingId },
                });

                if (affectedCount > 0) {
                  batchUpdatedLeads.push({ id: existingId, ...updateData });

                  // 🟢 Notification Flow
                  // const assignedTo = existingValues?.LeadAssignments?.[0]?.assigned_to;
                  // if (assignedTo) {
                  //   const notification = await saveNotification(
                  //     {
                  //       employee_id: assignedTo,
                  //       notification_from: userName,
                  //       notification_title: 'New Lead Re-Engagement',
                  //       message: `Lead ${lead.name || existingValues.name} has been re-engaged.`,
                  //     },
                  //     transaction
                  //   );

                  //   const io = getIo();
                  //   io.to(`user_${assignedTo}`).emit("leadAssignment", {
                  //     message: `Lead ${lead.name || existingValues.name} has been re-engaged.`,
                  //     assignedBy: userName,
                  //     leadCount: 1,
                  //     notificationId: notification.id,
                  //     notification_title: 'New Lead Re-Engagement'
                  //   });
                  // }

                  // 🔹 Add to user → lead list map
                  const assignedTo =
                    existingValues?.LeadAssignments?.[0]?.assigned_to;
                  if (assignedTo) {
                    if (!assignedLeadsMap.has(assignedTo)) {
                      assignedLeadsMap.set(assignedTo, []);
                    }
                    assignedLeadsMap.get(assignedTo).push(existingId);
                  }

                  // Activity log
                  const changesText = Object.entries(changedFields)
                    .map(
                      ([field, { previous, current }]) =>
                        `${field}: ${formatValue(previous)} → ${formatValue(
                          current
                        )}`
                    )
                    .join("; ");

                  bulkActivityLogs.push({
                    created_by: userId,
                    activity_type: "LEAD_BULK_UPDATE",
                    activity_desc: `Updated lead ${existingId} in bulk import: ${changesText}`,
                    lead_id: existingId,
                    lead_name: lead.name || existingValues.name,
                    note: `Batch ${processedCount + 1}`,
                    status: "active",
                    updated_at: new Date(),
                  });

                  if (bulkActivityLogs.length >= LOG_BATCH_SIZE) {
                    await insertActivityLogs(bulkActivityLogs);
                    bulkActivityLogs = [];
                  }
                }
              }
            } catch (err) {
              console.error(`Error updating lead ${existingId}:`, err);
              allInvalidLeads.push({
                ...lead,
                phone: lead.original_phone,
                reason: getErrorReason(err) || "Update failed",
              });
            }
          }
        );

        await Promise.all(updatePromises);

        // 🔹 Step 2: Send one notification per user after processing updates
        const io = getIo();
        for (const [assignedTo, leadIds] of assignedLeadsMap) {
          const notification = await saveNotification(
            {
              employee_id: assignedTo,
              notification_from: userName,
              notification_title: "Leads Re-Engaged",
              message: `${leadIds.length} leads have been re-engaged.`,
            },
            transaction
          );

          io.to(`user_${assignedTo}`).emit("leadAssignment", {
            notification_title: "Leads Re-Engaged",
            message: `${leadIds.length} leads have been re-engaged.`,
            assignedBy: userName,
            leadCount: leadIds.length,
            notificationId: notification.id,
          });
        }
      }

      // Insert invalid leads
      if (invalidLeads.length > 0) {
        try {
          await InvalidLead.bulkCreate(invalidLeads, { validate: false });
          allInvalidLeads.push(...invalidLeads);
        } catch (bulkInvalidErr) {
          console.error("Invalid bulk insert failed:", bulkInvalidErr);
          for (const lead of invalidLeads) {
            try {
              await InvalidLead.create(lead);
              allInvalidLeads.push(lead);
            } catch (err) {
              console.error("Single invalid insert failed:", err);
            }
          }
        }
      }

      allCreatedLeads.push(...batchCreatedLeads);
      allUpdatedLeads.push(...batchUpdatedLeads);
      processedCount++;
    }

    // Flush remaining logs
    if (bulkActivityLogs.length > 0) {
      await insertActivityLogs(bulkActivityLogs);
    }

    await transaction.commit();

    return ApiResponse(res, "success", 201, "Leads processed successfully", {
      totalReceived: req.body.length,
      totalValidLeads: allCreatedLeads.length + allUpdatedLeads.length,
      totalCreated: allCreatedLeads.length,
      totalUpdated: allUpdatedLeads.length,
      totalInvalidLeads: allInvalidLeads.length,
      totalLogsCreated: bulkActivityLogs.length,
      createdLeads: allCreatedLeads.map((l) => formatLeadResponse(l)),
      updatedLeads: allUpdatedLeads.map((l) => formatLeadResponse(l)),
      invalidLeads: allInvalidLeads,
    });
  } catch (err) {
    await transaction.rollback();
    console.error("Unexpected error:", err);
    return ApiResponse(
      res,
      "error",
      500,
      err?.message || "Failed to process leads",
      {
        error: err.message,
      }
    );
  }
}

// Helper function to insert activity logs with proper validation
async function insertActivityLogs(logs) {
  try {
    const validLogs = logs.map((log) => ({
      created_by: log.created_by,
      activity_type: log.activity_type,
      activity_desc: log.activity_desc,
      lead_id: log.lead_id,
      lead_name: log.lead_name,
      note: log.note,
      status: log.status,
      created_at: log.created_at,
      updated_at: log.updated_at,
    }));

    await ActivityLog.bulkCreate(validLogs);
  } catch (err) {
    console.error("Failed to bulk insert activity logs:", err);

    // Fallback to individual inserts with transaction
    const transaction = await sequelize.transaction();
    try {
      for (const log of logs) {
        await ActivityLog.create(
          {
            created_by: log.created_by,
            activity_type: log.activity_type,
            activity_desc: log.activity_desc,
            lead_id: log.lead_id,
            lead_name: log.lead_name,
            note: log.note,
            status: log.status,
          },
          { transaction }
        );
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      console.error("Failed to insert activity logs:", e);
    }
  }
}

// Helper functions
function isEqual(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;

  return keys.every((k) => isEqual(a[k], b[k]));
}

function formatValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatLeadResponse(lead) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    lead_source: lead.lead_source,
    ...(lead.bereau_score && { bereau_score: lead.bereau_score }),
    ...(lead.utm_campaign && { utm_campaign: lead.utm_campaign }),
    ...(lead.utm_source && { utm_source: lead.utm_source }),
    ...(lead.lead_status && { lead_status: lead.lead_status }),
  };
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
      application_status = null,
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
      table_type,
      lead_type,
      utm_campaign,
      utm_source,
      last_updated_status,
      activity_date // Add the new activity_date filter
    } = req.query;

    // const limit = parseInt(req.query.limit) || 50;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    // Default validation to prevent non-integer inputs
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const whereConditions = {};
    let leadAssignmentConditions = {};
    
    // Handle activity_date filter using subquery
    if (activity_date) {
      const [startRange, endRange] = activity_date.split(',');
      
      let startOfRangeUTC, endOfRangeUTC;
      
      if (startRange && endRange) {
        // Date range provided
        startOfRangeUTC = moment
          .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
        endOfRangeUTC = moment
          .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
      } else {
        // Single date provided
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
        
        startOfRangeUTC = startOfDayUTC;
        endOfRangeUTC = endOfDayUTC;
      }

      // Add subquery condition to whereConditions
      whereConditions.id = {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT lead_id 
          FROM ActivityLogs 
          WHERE createdAt BETWEEN '${startOfRangeUTC.toISOString()}' AND '${endOfRangeUTC.toISOString()}'
          AND status = 'active'
          AND lead_id IS NOT NULL
        )`)
      };
    }

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
    if (last_updated_status) whereConditions.last_updated_status = last_updated_status;
    if (activity_status)
      whereConditions.lead_status = { [Op.like]: `%${activity_status}` };
    console.log("verification status = ", verification_status);
    if (utm_campaign) {
      whereConditions.utm_campaign = { [Op.like]: `%${utm_campaign}%` };
    }

    if (utm_source) {
      whereConditions.utm_source = { [Op.like]: `%${utm_source}%` };
    }

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
      if (lead_bucket === LOGINS) {
        if (lead_status === "Login Bank") {
          whereConditions.lead_status = { [Op.like]: `%${lead_status}%` };
        } else {
          whereConditions.lead_status = lead_status;
        }
      } else {
        if (lead_status === "Login Bank") {
          whereConditions.last_updated_status = {
            [Op.like]: `%${lead_status}%`,
          };
        } else {
          whereConditions.lead_status = lead_status;
        }
      }
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

    if (lead_type) {
      switch (lead_type) {
        case NORMAL_LOGIN:
          whereConditions.is_paid = false;
          break;
        case PAID:
          whereConditions.is_paid = true;
          break;
      }
    }

    const verification_statuses = Array.isArray(verification_status)
      ? verification_status.filter((s) => s !== "")
      : [verification_status].filter((s) => s !== "");

    if (table_type === "Normal Login") {
      whereConditions[Op.or] = [
        { verification_status: { [Op.like]: "Normal Login" } },
        // { verification_status: { [Op.eq]: null } },
        { application_status: { [Op.like]: "Normal Login" } },
        // { application_status: { [Op.eq]: null } },
      ];
    }

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
      if (application_status !== undefined && application_status !== null) {
        if (application_status === "null") {
          whereConditions.application_status = { [Op.is]: null };
        } else {
          whereConditions.application_status = {
            [Op.like]: `%${application_status}%`,
          };
        }
      } else {
        // This executes when application_status is undefined or null
        // exclude "Normal Login" but include null and others
        whereConditions[Op.and] = [
          {
            [Op.or]: [
              { application_status: { [Op.notLike]: "Normal Login" } },
              { application_status: { [Op.is]: null } },
            ],
          },
          {
            [Op.or]: [
              { lead_bucket: { [Op.ne]: "APPROVED_APPLICATIONS" } },
              { lead_bucket: { [Op.is]: null } },
            ],
          },
        ];
      }

      // ✅ Always push walkIns include
      includeConditions.push({
        model: WalkIn,
        as: "walkIns",
        attributes: walk_in_attributes,
        required: false,
        order: [["id", "DESC"]],
        limit: 1,
      });
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
    
    // This will now work correctly with pagination including activity_date filter
    const { count, rows } = await Lead.findAndCountAll({
      where: whereConditions,
      include: includeConditions,
      order: orderConditions,
      limit: isPaginationEnabled ? pageSize : null,
      offset: isPaginationEnabled ? (page - 1) * pageSize : null,
      distinct: true,
    });

    const approvedLeadIds = rows
      .filter(
        (lead) =>
          lead.lead_bucket === "APPROVED_APPLICATIONS" && lead.is_paid === true
      )
      .map((lead) => lead.id);

    let disputeCheckMap = {};

    if (approvedLeadIds.length > 0) {
      // 1️⃣ Fetch closed loans
      const loanReports = await LoanReport.findAll({
        where: {
          lead_id: { [Op.in]: approvedLeadIds },
          loan_status: "Closed",
          status: "active",
        },
        attributes: ["lead_id", "dispute_status"],
      });

      // 2️⃣ Fetch closed credit reports
      const creditReports = await CreditReport.findAll({
        where: {
          lead_id: { [Op.in]: approvedLeadIds },
          loan_status: "Closed",
          status: "active",
        },
        attributes: ["lead_id", "dispute_status"],
      });

      // Combine results into a single grouping
      const reportsByLead = {};

      [...loanReports, ...creditReports].forEach((report) => {
        if (!reportsByLead[report.lead_id]) reportsByLead[report.lead_id] = [];
        reportsByLead[report.lead_id].push(report.dispute_status);
      });

      // Check the "all dispute updated" condition
      for (const leadId in reportsByLead) {
        const reports = reportsByLead[leadId];

        // Only set to true if:
        // 1. There are reports (array not empty)
        // 2. Every report has "Dispute Updated" status
        disputeCheckMap[leadId] =
          reports.length > 0 &&
          reports.every((status) => status === "Dispute Updated");
      }
    }

    // 3️⃣ Add the flag to each lead
    rows.forEach((lead) => {
      if (
        lead.lead_bucket === "APPROVED_APPLICATIONS" &&
        lead.is_paid === true
      ) {
        // Only set to true if:
        // 1. The lead exists in disputeCheckMap (has reports)
        // 2. All reports have "Dispute Updated" status
        lead.dataValues.isUserAllowedToUpdateAllDisputes =
          lead.id in disputeCheckMap && disputeCheckMap[lead.id];
      } else {
        lead.dataValues.isUserAllowedToUpdateAllDisputes = false;
      }
    });

    let callsStartDate = null;
    let callsEndDate = null;

    if (importedOn) {
      const [start, end] = importedOn.split(",");
      if (start && end) {
        callsStartDate = moment
          .tz(start, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
        callsEndDate = moment
          .tz(end, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
          .utc()
          .toDate();
      }
    }

    // SQL to get call count grouped by created_by
    const callCounts = await sequelize.query(
      `SELECT lead_id, COUNT(*) AS total_changes
        FROM Activities
        WHERE (:startDate IS NULL OR createdAt >= :startDate)
          AND (:endDate IS NULL OR createdAt <= :endDate)
        GROUP BY lead_id`,
      {
        replacements: {
          startDate: callsStartDate,
          endDate: callsEndDate,
        },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    // Map for quick lookup by lead_id
    const callCountMap = {};
    callCounts.forEach(({ lead_id, total_changes }) => {
      callCountMap[lead_id] = parseInt(total_changes);
    });

    rows.forEach((lead) => {
      const leadId = lead.dataValues?.id;

      lead.dataValues.calls_count = leadId ? callCountMap[leadId] || 0 : 0;
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
      error?.message || "Failed to fetch leads!",
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
      error?.message || "Failed to fetch lead by id",
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
      return ApiResponse(
        res,
        "error",
        400,
        "User Not Found!",
        null,
        null,
        null
      );
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

    if (
      application_status &&
      !validApplicationStatuses.includes(application_status)
    ) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Invalid Application Status!");
    }

    // If application_status is provided, validate lead status
    if (
      application_status &&
      verification_status !== "12 documents collected"
    ) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "Application Status Cannot be Updated Now!"
      );
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
          return ApiResponse(
            res,
            "error",
            400,
            "Rejection reason is required!"
          );
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
      createdActivity = await ActivityServices.addActivity(
        activity,
        transaction
      );

      // Prepare lead update data
      const leadUpdateData = {
        lead_status: activity.activity_status,
        last_updated_status: activity.activity_status, // Always update last_updated_status
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
          ACTIVITY_LOGS.TASK_CREATE(
            activity.activity_status,
            activity.follow_up
          ),
          ACTIVITY_TYPES.TASK_CREATE,
          userId,
          leadId,
          activity.description,
          lead_name
        );
        logData = createLogData(
          ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
            activity.prev_status,
            activity.activity_status
          ),
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
          ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
            activity.prev_status,
            activity.activity_status
          ),
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
            verification_date: new Date(),
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
      error?.message || "Failed to update details!",
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
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    if (role !== ROLE_ADMIN && role !== ROLE_MANAGER) {
      await transaction.rollback();
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
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Invalid verification status!");
    }

    let updateData = {
      verification_status,
      last_updated_status: verification_status,
    };
    if (verification_status === "Rejected") {
      if (!rejection_reason || !rejected_by_id) {
        await transaction.rollback();
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

    if (verification_status === "Send To Login") {
      (updateData.lead_bucket = LOGINS),
        (updateData.application_status = "Send To Login");
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
      error?.message || "Failed to update verification status!",
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
      error?.message || "Failed to fetch total leads count!",
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
      table_type,
    } = req.body;

    if (!lead_id || !application_status || !lead_status || !role) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    if (
      role !== ROLE_ADMIN &&
      role !== ROLE_MANAGER &&
      role !== ROLE_OPERATIONS_TEAM
    ) {
      await transaction.rollback();
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
      "Checker Approved",
      "Send To Login",
      "Under Process",
      "Application On Hold",
      "Disbursed from Banks",
      "Start Login",
    ];

    if (!validApplicationStatuses.includes(application_status)) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Invalid Appliation Status !");
    }

    if (lead_bucket !== LOGINS && lead_status !== "12 documents collected") {
      if (lead_bucket !== "APPROVED_APPLICATIONS") {
        await transaction.rollback();
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
        await transaction.rollback();
        return ApiResponse(res, "error", 400, "Rejection reason is required !");
      }
      updateData.is_rejected = true;
      updateData.rejection_reason = rejection_reason;
      updateData.rejected_by_id = rejected_by_id;
      updateData.rejected_at = moment().format("YYYY-MM-DD HH:mm:ss");
      updateData.updated_by = user_id;
    } else if (application_status === "Application Approved") {
      if (!closing_date || !lead_bucket) {
        await transaction.rollback();
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
    } else if (application_status === "Application Closed") {
      // If the application status is not Rejected, set is_rejected to false and rejection_reason to null
      updateData.application_status_note = application_status_note;
      updateData.is_rejected = false;
      updateData.rejection_reason = null;
      updateData.rejected_by_id = null;
      updateData.rejected_at = null;
      updateData.updated_by = user_id;
      updateData.lead_status = "Closed";
    } else if (application_status === "Send To Login") {
      if (table_type === "Paid" && lead_status !== "All Disputes Updated") {
        await transaction.rollback();
        return ApiResponse(
          res,
          "ERROR",
          400,
          "Lead status should be All Disputes Udpated"
        );
      }
      updateData.application_status_note = application_status_note;
      updateData.is_rejected = false;
      updateData.rejection_reason = null;
      updateData.rejected_by_id = null;
      updateData.rejected_at = null;
      updateData.updated_by = user_id;
      updateData.lead_bucket = LOGINS;
    } else {
      // If the application status is not Rejected, set is_rejected to false and rejection_reason to null
      if (application_status === "Start Login") {
        updateData.start_login_date = Date.now();
      }
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
        : application_status === "Application Closed"
        ? `Updated Application Status to : Application Closed & Updated Lead Status to : Application Closed`
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
      error?.message || "Failed to update application status !",
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
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    if (
      ![ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM, ROLE_MANAGER].includes(
        role
      )
    ) {
      await transaction.rollback();
      return ApiResponse(res, "error", 403, "Access Denied !");
    }

    if (!LEAD_STATUSES.includes(lead_status)) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Invalid Appliation Status !");
    }

    if (lead_status === "Others" && !others_note) {
      await transaction.rollback();
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

    if (
      [
        LOGIN_BANK_1,
        LOGIN_BANK_2,
        LOGIN_BANK_3,
        LOGIN_BANK_4,
        LOGIN_BANK_5,
        LOGIN_BANK_6,
      ].includes(lead_status)
    ) {
      updatePayload.application_status = UNDER_PROCESS;
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
      error?.message || "Failed to update lead status !",
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
      error?.message || "Failed to fetch lead sources !",
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
      error?.message || "Failed to fetch lead source by name !",
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
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Lead ID is required!");
    }

    if (Object.keys(req.body).length === 0) {
      await transaction.rollback();
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
      error?.message || "Failed to update lead details!",
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
      error?.message || "Failed to fetch ex-emp leads !",
      null,
      error,
      null
    );
  }
}

async function uploadLead(req, res) {
  const transaction = await sequelize.transaction();
  try {
    let {
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
      preferred_bank_name,
      utm_campaign,
      utm_source,
      income_type,
      company,
      salary,
      from_google_sheet = false,
      pan
    } = req.body;
    
    console.log('request received = ', req.body)

    if (client_secret !== "SQ") {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Un-Authorized Access !");
    }
    
    if (!name || !phone || !lead_source || !loan_type) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    if(lead_source !== "Veda Elite"){
      const phoneValidationReason = getPhoneValidationReason(String(phone));
      if (phoneValidationReason) {
        await transaction.rollback();
        return ApiResponse(
          res,
          "error",
          400,
          `Invalid phone number : ${phoneValidationReason}`
        );
      } 
    }

    if (income_type === "Salaried" && (!company || !salary)) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Please proivde company and salary if you are salaried"
      );
    }

    if (loan_amount) {
      loan_amount = Number(loan_amount).toFixed(0);
      required_loan_amount = Number(loan_amount).toFixed(0);
    }

    const leadFromDB = await Lead.findOne({
      where: { phone },
      include: [
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          attributes: ["id", "assigned_to"],
          required: false,
        },
      ],
      transaction,
    });

    if (leadFromDB) {
      console.log("lead from db = ", leadFromDB.toJSON());
      const prev_lead_data = leadFromDB.toJSON();
      // Update current lead source
      // leadFromDB.lead_source = lead_source;

        // ✅ Only update lead_source if utm_campaign is NOT "/internal/free-credit-score"
      if (utm_campaign !== "/internal/free-credit-score") {

        // check if bureau name is 'Crif'
        if(bereau_name === 'Crif'){
          const createdAt = leadFromDB.createdAt
          const now = moment.utc()

          const isOlderThan30Days = now.diff(moment.utc(createdAt), "milliseconds") > 30 * 24 * 60 * 60 * 1000;
          if(isOlderThan30Days){
              leadFromDB.lead_source = lead_source;
              // Update previous sources array
              const prevSources = leadFromDB.prev_lead_sources || [];
              const updatedSources = [lead_source, ...prevSources];
              leadFromDB.prev_lead_sources = updatedSources;
          }
        }else {
          leadFromDB.lead_source = lead_source;
          // Update previous sources array
          const prevSources = leadFromDB.prev_lead_sources || [];
          const updatedSources = [lead_source, ...prevSources];
          leadFromDB.prev_lead_sources = updatedSources;
        }
      }

      leadFromDB.visit_count = (leadFromDB.visit_count || 0) + 1;
      leadFromDB.product = loan_type;
      leadFromDB.lead_status = "Re Engaged";
      leadFromDB.last_updated_status = "Re Engaged";

      // update utm campaign and source array to track marketing performance
      if (utm_campaign && utm_source) {
        leadFromDB.utm_campaign = utm_campaign;
        const prevUtmCampaigns = leadFromDB.prev_utm_campaigns || [];
        const updatedUtmCampaigns = [utm_campaign, ...prevUtmCampaigns];
        leadFromDB.prev_utm_campaigns = updatedUtmCampaigns;

        leadFromDB.utm_source = utm_source;
        const prevUtmSources = leadFromDB.prev_utm_sources || [];
        const updatedUtmSources = [utm_source, ...prevUtmSources];
        leadFromDB.prev_utm_sources = updatedUtmSources;
      }

      if (loan_amount) leadFromDB.loan_amount = loan_amount;
      if (bereau_score) {
        leadFromDB.bereau_score = bereau_score;
        if (bereau_name) {
          leadFromDB.bereau_name = bereau_name;
        } else {
          leadFromDB.bereau_name = "Others";
        }
      }

      if (city) {
        leadFromDB.city = city;
        if (!leadFromDB.address) {
          leadFromDB.address = city;
        }
      }
      if (preferred_bank_name)
        leadFromDB.preferred_bank_name = preferred_bank_name;
      // if (email) leadFromDB.email = email;
      if (income_type) leadFromDB.income_type = income_type;
      if (company) leadFromDB.company = company;
      if (salary) leadFromDB.salary = salary;
      if (name) leadFromDB.name = name;
      if (email) leadFromDB.email = email;
      if (pan) leadFromDB.pan = pan;

      await leadFromDB.save({ transaction });

      const updatedLead = leadFromDB.toJSON();
      let logMessages = [];

      for (const key in req.body) {
        const prevValue = prev_lead_data[key];
        const newValue = updatedLead[key];

        if (
          prevValue != null &&
          newValue != null &&
          String(prevValue) !== String(newValue)
        ) {
          logMessages.push(
            `${key} changed from '${prevValue}' to '${newValue}'`
          );
        }
      }

      if (prev_lead_data.lead_status !== updatedLead.lead_status) {
        logMessages.push(
          `lead_status changed from '${prev_lead_data.lead_status}' to '${updatedLead.lead_status}'`
        );
      }

      if (logMessages.length > 0) {
        let logData = createLogData(
          `Lead details updated: ${logMessages.join(", ")}`,
          ACTIVITY_TYPES.LEAD_UPDATE,
          0,
          leadFromDB.id,
          null,
          leadFromDB.name
        );
        await createActivityLog(logData, transaction);
      }

      if (leadFromDB?.LeadAssignments.length > 0) {
        let assigned_to = leadFromDB.LeadAssignments[0].assigned_to;
        const io = getIo();
        const notification = await saveNotification(
          {
            employee_id: assigned_to,
            notification_from: from_google_sheet ? "Meta Ads" : "Website",
            notification_title: "Lead Re-Engaged",
            message: `1 lead has been re-engaged.`,
          },
          transaction
        );
        io.to(`user_${assigned_to}`).emit("leadAssignment", {
          notification_title: "Leads Re-Engaged",
          message: `1 lead has been re-engaged.`,
          notification_from: from_google_sheet ? "Meta Ads" : "Website",
          leadCount: 1,
          notificationId: notification.id,
        });
      }

      await transaction.commit();
      return ApiResponse(res, "success", 201, "Lead updated successfully!");
    } else {
      let leadToBeSaved = {
        ...req.body,
        product: loan_type,
        last_updated_status: "Not Contacted",
      };
      if (utm_campaign) {
        leadToBeSaved.utm_campaign = utm_campaign;
        if (!utm_source) {
          await transaction.rollback();
          return ApiResponse(
            res,
            "ERROR",
            400,
            "utm source is required for utm campaign"
          );
        }
        leadToBeSaved.utm_source = utm_source;
      }
      if (income_type) leadToBeSaved.income_type = income_type;
      if (company) leadToBeSaved.company = company;
      if (salary) leadToBeSaved.salary = salary;
      if (bereau_score) {
        leadToBeSaved.bereau_score = bereau_score;
        if (bereau_name) {
          leadToBeSaved.bereau_name = bereau_name;
        } else {
          leadToBeSaved.bereau_name = "Others";
        }
      }

      const savedLead = await Lead.create(leadToBeSaved, { transaction });

      // uncomment below code if you want to send notification to admins
      // const adminUsers = await User.findAll({
      //   where: {
      //     status: "active",
      //     role_id: 1,
      //   },
      //   attributes: ["id"],
      //   raw: true,
      //   transaction,
      // });

      // const adminUserIds = adminUsers.map((user) => user.id);

      // const io = getIo();

      // for (const adminId of adminUserIds) {
      //   const notification = await saveNotification(
      //     {
      //       employee_id: adminId, // Send to admin user
      //       notification_from: from_google_sheet ? "Meta Ads" : "Website",
      //       notification_title: "Lead Added",
      //       message: `1 lead ( ${name} - ${phone}) has been added.`,
      //     },
      //     transaction
      //   );

      //   // Emit to each admin user's socket
      //   io.to(`user_${adminId}`).emit("leadAssignment", {
      //     notification_title: "Lead Added",
      //     message: `1 lead ( ${name} - ${phone}) has been added.`,
      //     notification_from: from_google_sheet ? "Meta Ads" : "Website",
      //     leadCount: 1,
      //     notificationId: notification.id,
      //   });
      // }

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
    console.log("error in uploading leads = ", error);

    await transaction.rollback();
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to upload lead!",
      null,
      error
    );
  }
}

async function addNewLead(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      name,
      email,
      phone,
      source,
      bereau_score,
      utm_campaign,
      utm_source,
      bereau_name,
    } = req.body;

    // Validate mandatory fields
    if (!name || !phone || !source) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "Name, Phone, and Source are required fields!"
      );
    }

    // if(utm_campaign && !utm_source){
    //   return ApiResponse(res, "ERROR", 400, "utm source is required for utm campaign")
    // }

    if (bereau_score && !bereau_name) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Bureau Name is required for Bureau Score"
      );
    }

    // Validate phone number
    if (!isValidIndianMobile(phone)) {
      await transaction.rollback();
      const reason = getPhoneValidationReason(phone);
      return ApiResponse(res, "error", 400, `Invalid phone number: ${reason}`);
    }

    const normalizedPhone = extractTenDigitMobile(phone);
    if (!normalizedPhone) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Unable to normalize phone number");
    }

    // More efficient search for existing leads
    const existingLead = await Lead.findOne({
      where: {
        [Op.or]: [
          // Exact match (for normalized numbers)
          { phone: normalizedPhone },

          // Match numbers containing the normalized 10 digits
          { phone: { [Op.substring]: normalizedPhone } },

          // Match numbers ending with the 10 digits
          { phone: { [Op.endsWith]: normalizedPhone } },

          // Match common Indian phone formats
          { phone: { [Op.eq]: `+91${normalizedPhone}` } },
          { phone: { [Op.eq]: `91${normalizedPhone}` } },
          { phone: { [Op.eq]: `0${normalizedPhone}` } },

          // Match with spaces/dashes in different positions
          {
            phone: {
              [Op.eq]: `+91 ${normalizedPhone.slice(
                0,
                5
              )} ${normalizedPhone.slice(5)}`,
            },
          },
          {
            phone: {
              [Op.eq]: `${normalizedPhone.slice(0, 5)}-${normalizedPhone.slice(
                5
              )}`,
            },
          },
        ],
      },
      transaction,
    });

    if (existingLead) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        409,
        `Lead with this phone already exists (as ${existingLead.phone})`
      );
    }

    // Create new lead with normalized phone
    const newLead = await Lead.create(
      {
        name,
        email,
        phone: normalizedPhone,
        lead_source: source,
        last_updated_status: "Not Contacted",
        ...(bereau_score && { bereau_score: bereau_score }),
        ...(bereau_name && { bereau_name: bereau_name }),
        ...(utm_campaign && { utm_campaign }),
        ...(utm_source && { utm_source }),
      },
      { transaction }
    );

    await transaction.commit();
    return ApiResponse(
      res,
      "success",
      201,
      "Lead added successfully!",
      newLead
    );
  } catch (error) {
    await transaction.rollback();

    if (error.name === "SequelizeUniqueConstraintError") {
      return ApiResponse(
        res,
        "error",
        409,
        "Lead with this phone already exists."
      );
    }

    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to add lead!",
      null,
      error
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

async function getCrifReportByCustomerIdOrPhone(req, res) {
  try {
    const { customer_id, mob1, lead_id } = req.query;
    console.log("params received = ", req.query);

    // Validation: lead_id is mandatory, and either customer_id or mob1 must be present
    if (!lead_id || (!customer_id && !mob1)) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Missing required fields! 'lead_id' is mandatory along with either 'customer_id' or 'mob1'."
      );
    }

    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    const response = await axios.get(
      `${process.env.SAJAN_BACKEND_URL}/api/b2c-reports/get-b2c-report-by-customer-phone-or-id`,
      {
        params: {
          ...(customer_id && { customer_id }),
          ...(mob1 && { mob1 }),
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        validateStatus: () => true, // ✅ Always resolve response
      }
    );

    // Handle response
    if (
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ) {
      const fetchedCustomerId = response.data.data.customer_id;

      if (!fetchedCustomerId) {
        return ApiResponse(
          res,
          "ERROR",
          400,
          "Customer ID not found in response."
        );
      }

      await Lead.update(
        { customer_id: fetchedCustomerId },
        { where: { id: lead_id } }
      );

      return ApiResponse(
        res,
        "SUCCESS",
        200,
        "Report fetched and lead updated successfully.",
        response.data
      );
    } else {
      // Backend returned handled error (e.g. 400, 404, etc.)
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 400,
        response.data.message || "Failed to fetch report."
      );
    }
  } catch (error) {
    // Unexpected server/network error
    console.error("Unexpected error:", error);

    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Something went wrong!",
      null,
      error
    );
  }
}

async function getCrifSummaryReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    console.log("params received = ", req.query);

    if (startDate && !endDate) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "End Date is madatory for start date "
      );
    }

    if (endDate && !startDate) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Start Date is madatory for end date"
      );
    }

    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    const response = await axios.get(
      `${process.env.SAJAN_BACKEND_URL}/api/b2c-reports/get-crif-summary-report`,
      {
        params: {
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        validateStatus: () => true,
      }
    );

    // Handle response
    if (
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ) {
      return ApiResponse(
        res,
        "SUCCESS",
        200,
        "Report fetched and lead updated successfully.",
        response.data.data
      );
    } else {
      // Backend returned handled error (e.g. 400, 404, etc.)
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 400,
        response.data.message || "Failed to fetch summary report."
      );
    }
  } catch (error) {
    console.log("error in fetching crif summary report = ", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch crif summary report !",
      null,
      error
    );
  }
}

async function getCustomers(req, res) {
  try {
    const { startDate, endDate, page, pageSize } = req.query;
    console.log("params received = ", req.query);

    if (startDate && !endDate) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "End Date is madatory for start date "
      );
    }

    if (endDate && !startDate) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Start Date is madatory for end date"
      );
    }

    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    const response = await axios.get(
      `${process.env.SAJAN_BACKEND_URL}/api/b2c-reports/get-customers`,
      {
        params: {
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          ...(page && { page }),
          ...(pageSize && { pageSize }),
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        validateStatus: () => true,
      }
    );

    // Handle response
    if (
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ) {
      return ApiResponse(
        res,
        "SUCCESS",
        200,
        "Report fetched and lead updated successfully.",
        response.data.data.result,
        null,
        response.data.data.pagination
      );
    } else {
      // Backend returned handled error (e.g. 400, 404, etc.)
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 400,
        response.data.message || "Failed to fetch summary report."
      );
    }
  } catch (error) {
    console.log("error in fetcing customers = ", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch customers !",
      null,
      error
    );
  }
}

async function getAllDistinctUtmCampaignsAndSources(req, res) {
  try {
    const utmData = await Lead.findAll({
      attributes: ["utm_campaign", "utm_source"],
      where: {
        [Op.or]: [
          { utm_campaign: { [Op.ne]: null } },
          { utm_source: { [Op.ne]: null } },
        ],
      },
      raw: true,
    });

    const uniqueCampaigns = [
      ...new Set(utmData.map((e) => e.utm_campaign).filter(Boolean)),
    ];
    const uniqueSources = [
      ...new Set(utmData.map((e) => e.utm_source).filter(Boolean)),
    ];

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Fetched distinct utm campaigns and sources",
      {
        utm_campaigns: uniqueCampaigns,
        utm_sources: uniqueSources,
      }
    );
  } catch (error) {
    console.log("error in fetching utm campaigns and sources = ", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch campaigns and sources!",
      null,
      error
    );
  }
}

async function getAllReEngagedLeads(req, res) {
  try {
    let {
      lead_status,
      page = 1,
      pageSize = 10,
      leadId,
      phone,
      name,
      lead_bucket,
      lead_source,
      utm_campaign,
      utm_source,
      assigned_to,
      importedOn,
      last_updated,
      assigned_on,
      userId,
      last_updated_status
    } = req.query;

    page = parseInt(page);
    pageSize = parseInt(pageSize);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    let leadWhere = {};
    let leadAssignmentWhere = {};

    if (lead_status) {
      leadWhere.lead_status = lead_status;
    }
    if(last_updated_status) {
      leadWhere.last_updated_status = last_updated_status;
    }

    if (leadId) leadWhere.id = { [Op.like]: `%${leadId}%` };
    if (phone) leadWhere.phone = { [Op.like]: `%${phone}%` };
    if (name) leadWhere.name = { [Op.like]: `%${name}%` };
    if (lead_bucket) leadWhere.lead_bucket = { [Op.like]: `%${lead_bucket}%` };
    if (lead_source) leadWhere.lead_source = { [Op.like]: `%${lead_source}%` };
    if (utm_campaign)
      leadWhere.utm_campaign = { [Op.like]: `%${utm_campaign}%` };
    if (utm_source) leadWhere.utm_source = { [Op.like]: `%${utm_source}%` };
    if (assigned_to) {
      if (assigned_to === "re_assigned") {
        leadWhere.is_reassigned = true;
      } else if (assigned_to === "not_assigned") {
        leadWhere[Op.and] = Sequelize.literal(`
        NOT EXISTS (
          SELECT 1 
          FROM LeadAssignments AS LA 
          WHERE LA.lead_id = Lead.id
        )
      `);
      } else {
        leadAssignmentWhere.assigned_to = assigned_to;
      }
    }
    if (userId) leadAssignmentWhere.assigned_to = userId;

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
        leadWhere.createdAt = {
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
        leadWhere.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
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

        leadAssignmentWhere.updatedAt = {
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

        leadAssignmentWhere.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    const { count, rows } = await Lead.findAndCountAll({
      where: leadWhere, // ✅ apply filter here
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          where: { status: "active", ...leadAssignmentWhere },
          required: ["assigned_to", "assigned_on", "updatedAt"].some((key) =>
            Object.keys(leadAssignmentWhere).includes(key)
          ),
          include: [
            {
              model: User,
              as: "AssignedTo",
              attributes: ["id", "name", "status"],
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
      pageSize: pageSize,
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Leads fetched successfully !",
      rows,
      null,
      pagination
    );
  } catch (error) {
    console.log("failed to fetch re engaged leads = ", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch re-engaged leads",
      null,
      error
    );
  }
}

async function downloadCrifReport(req, res) {
  try {
    const { customer_id } = req.body;
    console.log('received customer id = ', customer_id);
    
    if (!customer_id) {
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/customer/full-report`,
      { customerId: customer_id },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        responseType: "arraybuffer", // 👈 important to get raw PDF
      }
    );

    if (response.status !== 200) {
      return ApiResponse(
        res,
        "ERROR",
        response.status,
        "Failed to download CRIF report",
        null,
        response.data
      );
    }

    // 3. Set headers to tell client it's a PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=crif_report_${customer_id}.pdf`
    );

    // 4. Send PDF buffer to client
    return res.send(response.data);

  } catch (error) {
    console.log("failed to download crif report = ", error.message);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to download crif report !",
      null,
      error
    );
  }
}

async function uploadCibilReport(req,res){
  try {
    const { customer_id, report_id, lead_id, pan, report_date, full_report } = req.body
        if(!report_id || !lead_id || !pan || !report_date || !full_report){
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/cibil-reports/upload-cibil-report`,
      { report_id, lead_id, pan, report_date, full_report, ...(customer_id && {customer_id}) },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    if (
      response.data.statusCode === 201 &&
      response.data.status === "SUCCESS"
    ) {
      return ApiResponse(res, "SUCCESS", 201, "Cibil report uploaded successfully !", response.data.data)
    } else {
      // Backend returned handled error (e.g. 400, 404, etc.)
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to upload cibil report 1"
      );
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to upload cibil report !", null, error)
  }
}

async function getCibilReport(req,res){
  try {
    const { pan, lead_id,  report_id } = req.query
    if(!pan && !lead_id && !report_id){
      return ApiResponse(res, "ERROR", 400, "At least one of pan, lead_id, or report_id is required.")
    }

    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    const response = await axios.get(
      `${process.env.SAJAN_BACKEND_URL}/api/cibil-reports/fetch-cibil-report`,
      {
        params: {
          ...(pan && {pan}),
          ...(lead_id && {lead_id}),
          ...(report_id && {report_id})
        },
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )

    if(response.data.statusCode === 200 && response.data.status === "SUCCESS"){
      return ApiResponse(res, "SUCCESS", 200, "asda", response.data.data)
    }else {
      return ApiResponse(res, "ERROR", response.data.statusCode || 400, response.data.message || "Failed to fetch cibil report")
    }
  } catch (error) {
    console.log('error in fetching cibil report = ', error);
    
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch cibil report !", null, error)
  }
}

async function uploadExperianReport(req,res){
  try {
    const { customer_id, report_id, lead_id, pan, report_date, full_report } = req.body
        if(!report_id || !lead_id || !pan || !report_date || !full_report){
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/experian-reports/upload-experian-report`,
      { report_id, lead_id, pan, report_date, full_report, ...(customer_id && {customer_id}) },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    if (
      response.data.statusCode === 201 &&
      response.data.status === "SUCCESS"
    ) {
      return ApiResponse(res, "SUCCESS", 201, "Experian report uploaded successfully !", response.data.data)
    } else {
      // Backend returned handled error (e.g. 400, 404, etc.)
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to upload experian report !"
      );
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to upload experian report !", null, error)
  }
}

async function getExperianReport(req,res){
  try {
    const { pan, lead_id,  report_id } = req.query
    if(!pan && !lead_id && !report_id){
      return ApiResponse(res, "ERROR", 400, "At least one of pan, lead_id, or report_id is required.")
    }

    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    const response = await axios.get(
      `${process.env.SAJAN_BACKEND_URL}/api/experian-reports/fetch-experian-report`,
      {
        params: {
          ...(pan && {pan}),
          ...(lead_id && {lead_id}),
          ...(report_id && {report_id})
        },
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )

    if(response.data.statusCode === 200 && response.data.status === "SUCCESS"){
      return ApiResponse(res, "SUCCESS", 200, "asda", response.data.data)
    }else {
      return ApiResponse(res, "ERROR", response.data.statusCode || 400, response.data.message || "Failed to fetch experian report")
    }
  } catch (error) {
    console.log('error in fetching experian report = ', error);
    
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch experian report !", null, error)
  }
}

async function uploadCrifParsedReport(req,res){
  try {
    const { customer_id, report_id, lead_id, pan, report_date, full_report } = req.body
        if(!report_id || !lead_id || !pan || !report_date || !full_report){
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/crif-parsed-reports/upload-crif-parsed-report`,
      { report_id, lead_id, pan, report_date, full_report, ...(customer_id && {customer_id}) },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    if (
      response.data.statusCode === 201 &&
      response.data.status === "SUCCESS"
    ) {
      return ApiResponse(res, "SUCCESS", 201, "Experian report uploaded successfully !", response.data.data)
    } else {
      // Backend returned handled error (e.g. 400, 404, etc.)
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to upload crif report !"
      );
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to upload crif report !", null, error)
  }
}

async function getCrifParsedReport(req,res){
  try {
    const { pan, lead_id,  report_id } = req.query
    if(!pan && !lead_id && !report_id){
      return ApiResponse(res, "ERROR", 400, "At least one of pan, lead_id, or report_id is required.")
    }

    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    const response = await axios.get(
      `${process.env.SAJAN_BACKEND_URL}/api/crif-parsed-reports/fetch-crif-parsed-report`,
      {
        params: {
          ...(pan && {pan}),
          ...(lead_id && {lead_id}),
          ...(report_id && {report_id})
        },
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )

    if(response.data.statusCode === 200 && response.data.status === "SUCCESS"){
      return ApiResponse(res, "SUCCESS", 200, "asda", response.data.data)
    }else {
      return ApiResponse(res, "ERROR", response.data.statusCode || 400, response.data.message || "Failed to fetch crif parsed report")
    }
  } catch (error) {
    console.log('error in fetching crif parsed report = ', error);
    
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch crif parsed report !", null, error)
  }
}

async function updateB2cReport(req,res){
  try {
      const { report_id, pan, open_accounts } = req.body
      if(!report_id || !pan || !open_accounts){
        return ApiResponse(res, "ERROR", 400, "Missing required fields !")
      }
      // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/b2c-reports/update-b2c-report`,
      { report_id, pan, open_accounts },
      {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )
    
    if(
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ){
      return ApiResponse(res, "SUCCESS", 200, "b2c report updated successfully .", response.data.data)
    } else {
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to updated b2c report !"
      )
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to update bc2 report !", null, error)
  }
}

async function updateExperianReport(req,res){
  try {
      const { report_id, pan, open_accounts } = req.body
      
      if(!report_id || !pan || !open_accounts){
        return ApiResponse(res, "ERROR", 400, "Missing required fields !")
      }
      // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/experian-reports/update-experian-report`,
      { report_id, pan, open_accounts },
      {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )
    
    if(
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ){
      return ApiResponse(res, "SUCCESS", 200, "b2c report updated successfully .", response.data.data)
    } else {
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to updated b2c report !"
      )
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to update bc2 report !", null, error)
  }
}

async function updateCibilReport(req,res){
  try {
    const { report_id, pan, open_accounts } = req.body

    if(!report_id || !pan || !open_accounts){
      return ApiResponse(res, "ERROR", 400, "Missing required fields !")
    }

    // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/cibil-reports/update-cibil-report`,
      { report_id, pan, open_accounts },
      {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )
    
    if(
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ){
      return ApiResponse(res, "SUCCESS", 200, "Cibil report updated successfully .", response.data.data)
    } else {
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to updated cibil report !"
      )
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to update cibil report !", null, error)
  }
}

async function updateCrifParsedReport(req,res){
  try {
    const { report_id, pan, open_accounts } = req.body

    if(!report_id || !pan || !open_accounts){
      return ApiResponse(res, "ERROR", 400, "Missing required fields !")
    }

    // 1. Get Auth Token
    const authToken = (
      await axios.post(
        `${process.env.SAJAN_BACKEND_URL}/api/auth/get-jwt-token`,
        {
          CLIENT_SECRET_KEY: "SQ",
        }
      )
    ).data.data;

    // 2. Call Sajan API and request binary response
    const response = await axios.post(
      `${process.env.SAJAN_BACKEND_URL}/api/crif-parsed-reports/update-crif-parsed-report`,
      { report_id, pan, open_accounts },
      {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    )

    if(
      response.data.statusCode === 200 &&
      response.data.status === "SUCCESS"
    ){
      return ApiResponse(res, "SUCCESS", 200, "Crif parsed report updated successfully .", response.data.data)
    } else {
      return ApiResponse(
        res,
        "ERROR",
        response.data.statusCode || 500,
        response.data.message || "Failed to updated crif parsed report !"
      )
    }
  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to update crif parsed report !", null, error)
  }
}

async function getImportedLeadStats(req,res){
  try {
    const { chartType="lead_source", startDate, endDate } = req.query

    // Build where clause with UTC conversion
    let where = {};
    if (startDate && endDate) {
      const startUtc = moment(startDate).utc().startOf("day").toDate();
      const endUtc = moment(endDate).utc().endOf("day").toDate();

      where.createdAt = {
        [Op.between]: [startUtc, endUtc],
      };
    }

    let stats;

    if (chartType === "utm_source") {
      // Group by utm_source + utm_campaign
      stats = await Lead.findAll({
        attributes: [
          "utm_source",
          "utm_campaign",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "total_leads"],
        ],
        where,
        group: ["utm_source", "utm_campaign"],
        order: [["utm_source", "ASC"]],
        raw: true, // returns plain JSON
      });
    } else {
      // Default: Group by lead_source
      stats = await Lead.findAll({
        attributes: [
          "lead_source",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "total_leads"],
        ],
        where,
        group: ["lead_source"],
        order: [["lead_source", "ASC"]],
        raw: true,
      });
    }

    return ApiResponse(res, "SUCCESS", 200, "Imported Leads stats fetched successfully ", stats)

  } catch (error) {
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch imported lead stats", null, error)
  }
}

async function getEmployeeWiseLeadStats(req, res) {
  try {
    const { chartType = "lead_source", startDate, endDate } = req.query;

    const where = {};
    if (startDate && endDate) {
      const startUtc = moment(startDate).utc().startOf("day").toDate();
      const endUtc = moment(endDate).utc().endOf("day").toDate();
      where.createdAt = { [Op.between]: [startUtc, endUtc] };
    }

    let stats;

    if (chartType === "utm_source") {
      // Group by employee + utm_source + utm_campaign
      stats = await Lead.findAll({
        attributes: [
          [Sequelize.col("LeadAssignments.assigned_to"), "employee_id"],
          "utm_source",
          "utm_campaign",
          [Sequelize.fn("COUNT", Sequelize.col("Lead.id")), "total_leads"],
        ],
        include: [
          {
            model: LeadAssignment,
            as: "LeadAssignments",
            attributes: [],
            required: true,
            where: { status: "active" },
          },
        ],
        where,
        group: [
          Sequelize.col("LeadAssignments.assigned_to"),
          "utm_source",
          "utm_campaign",
        ],
        order: [[Sequelize.col("LeadAssignments.assigned_to"), "ASC"]],
        raw: true,
      });
    } else {
      // Group by employee + lead_source
      stats = await Lead.findAll({
        attributes: [
          [Sequelize.col("LeadAssignments.assigned_to"), "employee_id"],
          "lead_source",
          [Sequelize.fn("COUNT", Sequelize.col("Lead.id")), "total_leads"],
        ],
        include: [
          {
            model: LeadAssignment,
            as: "LeadAssignments",
            attributes: [],
            required: true,
            where: { status: "active" },
          },
        ],
        where,
        group: [Sequelize.col("LeadAssignments.assigned_to"), "lead_source"],
        order: [[Sequelize.col("LeadAssignments.assigned_to"), "ASC"]],
        raw: true,
      });
    }

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Employee lead stats fetched successfully",
      stats
    );
  } catch (error) {
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch employee wise lead stats!",
      null,
      error
    );
  }
}

async function getLeadNames(req,res){
  try {
    const { leadIds } = req.body

    const leads = await LeadServices.getLeadNamesByLeadIds(leadIds)

    return ApiResponse(res, "SUCCESS", 200, "Names fetched succussfully", leads)

  } catch (error) {
    return ApiResponse(res, "ERROR", error?.message || "Failed to fetch lead names !", null, error)
  }
}

async function getAssignedLeads(req,res){
  const transaction = await sequelize.transaction()
  try {
    const { page=1, pageSize=20, leadId=null, phone=null, name=null, lead_bucket, assigned_to=null, lead_source=null, last_updated_status=null, utm_campaign=null, utm_source=null, importedOn=null, assigned_on=null, last_updated=null } = req.query;

    const offset = (page-1)*pageSize;

    let filters = { 
      leadId,
      phone,
      name,
      lead_bucket,
      assigned_to,
      lead_source,
      last_updated_status,
      utm_campaign,
      utm_source,
      importedOn,
      assigned_on,
      last_updated
    }
    let paginationData = { page, pageSize, offset }

    const response = await LeadServices.getAssignedLeads(filters,paginationData,transaction)
    await transaction.commit()
    return ApiResponse(res, "SUCCESS", 200, "Assigned leads fetched successfully", response.leads, null, response.pagination)
  } catch (error) {
    await transaction.rollback()
    console.log("Failed to fetch assigned leads ! = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch assigned leads !", null, error)
  }
}

async function getUnAssignedLeads(req,res){
  const transaction = await sequelize.transaction()
  try {
    const { page=1, pageSize=20, leadId=null, phone=null, name=null, lead_source=null, importedOn=null, utm_campaign=null, utm_source=null } = req.query

    const offset = (page-1)*pageSize

    let filters = {
      leadId,
      phone,
      name,
      lead_source,
      importedOn,
      utm_campaign,
      utm_source
    }

    let paginationData = { page, pageSize, offset }

    const response = await LeadServices.getUnAssignedLeads(filters, paginationData, transaction)
    await transaction.commit()
    return ApiResponse(res, "SUCCESS", 200, "UnAssigned leads fetched successfully", response.leads, null, response.pagination)
  } catch (error) {
    await transaction.rollback()
    console.log("Failed to fetch un assigned leads ! = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch un assigned leads !", null, error)
  }
}

async function getPreliminaryApprovalLeads(req,res){
  const transaction = await sequelize.transaction()
  try {
    const { page=1, pageSize=20, leadId=null, phone=null, name=null, lead_source=null, assigned_to=null, lead_status=null, verification_status=null } = req.query

    const offset = (page-1)*pageSize

    let filters = {
      leadId,
      phone,
      name,
      lead_source,
      assigned_to,
      verification_status,
      lead_status
    }

    let paginationData = { page, pageSize, offset }

    const response = await LeadServices.getPreliminaryApprovalLeads(filters,paginationData,transaction)
    await transaction.commit()
    return ApiResponse(res, "SUCCESS", 200, "Preliminary leads fetched successfully", response.leads, null, response.pagination)
  } catch (error) {
    await transaction.rollback()
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch preliminary approval leads !", null, error)
  }
}

async function getAppointmentLeads(req,res){
  try {
    const { page=1, pageSize=20, leadId=null, phone=null, name=null, appointment_date=null, lead_source=null, assigned_to=null, lead_status=null, application_status=null } = req.query
    const offset = (page-1)*pageSize

    let filters = {
      leadId,
      phone,
      name,
      appointment_date,
      lead_source,
      assigned_to,
      lead_status,
      application_status
    }

    let paginationData = { page, pageSize, offset }

    const response = await LeadServices.getAppointmentLeads(filters, paginationData)
    return ApiResponse(res, "SUCCESS", 200, "Appointment leads fetched successfully", response.leads, null, response.pagination)
  } catch (error) {
    console.log("Failed to fetch appointment leads = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch appointment leads !", null, error)
  }
}

async function getApprovedApplicationLeads(req,res){
  try {
    const { page=1, pageSize=20, leadId=null, phone=null, name=null, lead_source=null, lead_status=null, assigned_to=null, application_status=null, closing_date=null, verification_date=null, login_date=null, is_paid=false } = req.query
    const offset = (page-1)*pageSize

    let filters = {
      leadId,
      phone,
      name,
      lead_source,
      lead_status,
      assigned_to,
      application_status,
      closing_date,
      verification_date,
      login_date,
      is_paid
    }

    let paginationData = { page, pageSize, offset }

    const response = await LeadServices.getApprovedApplicationLeads(filters, paginationData)
    return ApiResponse(res, "SUCCESS", 200, "Approved application leads fetched successfully", response.leads, null, response.pagination)
  } catch (error) {
    console.log("Failed to fetch approved application leads = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch approved application leads !", null, error)
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
  addNewLead,
  getCrifReportByCustomerIdOrPhone,
  getCrifSummaryReport,
  getCustomers,
  getAllDistinctUtmCampaignsAndSources,
  getAllReEngagedLeads,
  downloadCrifReport,
  uploadCibilReport,
  getCibilReport,
  uploadExperianReport,
  getExperianReport,
  uploadCrifParsedReport,
  getCrifParsedReport,
  updateB2cReport,
  updateExperianReport,
  updateCibilReport,
  updateCrifParsedReport,
  getImportedLeadStats,
  getEmployeeWiseLeadStats,
  getLeadNames,
  getAssignedLeads,
  getUnAssignedLeads,
  getPreliminaryApprovalLeads,
  getAppointmentLeads,
  getApprovedApplicationLeads
};
