const { Op, Sequelize, where } = require("sequelize");
const moment = require("moment-timezone");
const {
  sequelize,
  LeadAssignment,
  Lead,
  User,
  Activity,
  LeadTransfer,
  WalkIn,
} = require("../models"); // Adjust paths as needed
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { INITIAL_LEAD_STATUSES, PIPELINE_ENTRIES } = require("../utilities/constants");
const ActivityLogServices = require("../services/ActivityLogServices");
const {
  ACTIVITY_LOGS,
  ACTIVITY_TYPES,
} = require("../utilities/ActivityLogConstants");
const { getIo } = require("../socket/socket");
const { saveNotification } = require("../services/NotificationServices");
const UserMetricsServices = require("../services/UserMetricsServices");

async function assignLeadsToEmployee(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { leadIds, assignedTo, assignedBy, userName } = req.body;

    // Validate input
    if (
      !Array.isArray(leadIds) ||
      leadIds.length === 0 ||
      !assignedTo ||
      !assignedBy
    ) {
      await transaction.rollback()
      return ApiResponse(res, "ERROR", 400, "Missing required fields!");
    }

    // Fetch the assigned employee and assigning user
    const [employee, assigningUser] = await Promise.all([
      User.findByPk(assignedTo),
      User.findByPk(assignedBy),
    ]);

    if (!employee) {
      await transaction.rollback()
      return ApiResponse(res, "ERROR", 404, "Assigned employee not found!");
    }
    if (!assigningUser) {
      await transaction.rollback()
      return ApiResponse(res, "ERROR", 404, "Assigning user not found!");
    }

    // check for existing leads
    const existingLeads = await LeadAssignment.findAll({
      where: { lead_id: leadIds.map((lead) => lead.id) },
      attributes: ["lead_id", "assigned_to"],
      include: [
        {
          model: Lead,
          as: "Lead",
          attributes: ["name"],
        },
      ],
      transaction,
    });

    console.log(
      "existing leads = ",
      existingLeads.map((lead) => lead.dataValues)
    );

    const existingLeadIds = existingLeads.map((lead) => lead.lead_id);

    let leadsToBeReAssigned = leadIds.filter((lead) =>
      existingLeadIds.includes(lead.id)
    );

    const freshLeads = leadIds.filter(
      (lead) => !existingLeadIds.includes(lead.id)
    );

    console.log("leads to be re-assigned = ", leadsToBeReAssigned);
    console.log("fresh leads = ", freshLeads);

    // fresh leads assignment flow
    if (freshLeads.length > 0) {
      // Assign fresh leads to the employee
      const bulkAssignments = freshLeads.map((lead) => ({
        lead_id: lead.id,
        assigned_to: assignedTo,
        assigned_by: assignedBy,
        status: "active",
        updatedAt: new Date().toISOString(),
      }));

      await LeadAssignment.bulkCreate(bulkAssignments, {
        updateOnDuplicate: [
          "assigned_to",
          "assigned_by",
          "status",
          "updatedAt",
        ],
        transaction,
      });

      const bulkUpdates = freshLeads.map((lead, index) => ({
        id: lead.id,
        updatedAt: new Date().toISOString(),
      }));

      await Lead.bulkCreate(bulkUpdates, {
        updateOnDuplicate: ["updatedAt"],
        transaction,
      });

      const newAssignmentActivityLogs = freshLeads.map((lead) => ({
        activity_desc: ACTIVITY_LOGS.LEAD_ASSIGNMENT(userName),
        activity_type: ACTIVITY_TYPES.LEAD_ASSIGNMENT,
        created_by: assignedBy,
        lead_id: lead.id,
        lead_name: lead.name,
      }));

      await Promise.all(
        newAssignmentActivityLogs.map((logData) =>
          ActivityLogServices.createActivityLog(logData, transaction)
        )
      );
    }

    // re assignments flow
    if (leadsToBeReAssigned.length > 0) {
      // Extract last_updated_status for each lead
      const leadsWithStatus = leadsToBeReAssigned.map((lead) => ({
        lead_id: lead.id,
        last_updated_status: lead.last_updated_status,
      }));

      // Define unwanted statuses
      const unwantedStatuses = [
        "RNR ( Ring No Response )",
        "Switched Off",
        "Busy",
        "Not Interested",
        "Not Working / Not Reachable",
        "Not Contacted",
      ];

      // Filter leads with unwanted statuses
      const leadsToClearActivities = leadsWithStatus
        .filter((lead) => unwantedStatuses.includes(lead.last_updated_status))
        .map((lead) => lead.lead_id);

      if (leadsToClearActivities.length > 0) {
        // Fetch the most recent unwanted activities for these leads
        const initialLevelActivities = await Activity.findAll({
          where: {
            lead_id: {
              [Op.in]: leadsToClearActivities,
            },
            activity_status: {
              [Op.in]: unwantedStatuses,
            },
          },
          attributes: ["id", "lead_id", "createdAt"],
          order: [["createdAt", "DESC"]],
          transaction,
        });

        // Filter the most recent unwanted activities for each lead
        const recentUnwantedActivities = initialLevelActivities.reduce(
          (acc, activity) => {
            if (
              !acc[activity.lead_id] ||
              acc[activity.lead_id].createdAt < activity.createdAt
            ) {
              acc[activity.lead_id] = activity;
            }
            return acc;
          },
          {}
        );

        // const dataValuesArray = Object.values(recentUnwantedActivities).map(
        //   (activity) => activity.dataValues
        // );

        // Remove unwanted activities from the database
        const unwantedActivityIds = initialLevelActivities.map(
          (activity) => activity.id
        );

        if (unwantedActivityIds.length > 0) {
          await Activity.destroy({
            where: { id: unwantedActivityIds },
            transaction,
          });
        }
      }

      // Proceed with re-assignment and status updates
      if (leadsToBeReAssigned.length > 0) {
        await Lead.update(
          {
            lead_status: "Not Contacted",
            last_updated_status: "Not Contacted",
            is_reassigned: true,
          },
          {
            where: {
              id: {
                [Op.in]: leadsToBeReAssigned.map((lead) => lead.id),
              },
              [Op.or]: [
                { last_updated_status: { [Op.in]: unwantedStatuses } },
                { last_updated_status: null },
              ],
            },
            // transaction,
          }
        );
        // Update is_reassigned if last_updated_status is NOT in unwantedStatuses
        await Lead.update(
          {
            is_reassigned: true, // Only is_reassigned is updated here
          },
          {
            where: {
              id: {
                [Op.in]: leadsToBeReAssigned.map((lead) => lead.id),
              },
              last_updated_status: {
                [Op.notIn]: unwantedStatuses,
              },
            },
            // transaction,
          }
        );

        // Update created_by in Activity table for reassigned leads
        await Activity.update(
          { created_by: assignedTo },
          {
            where: {
              lead_id: {
                [Op.in]: leadsToBeReAssigned.map((lead) => lead.id),
              },
            },
            transaction,
          }
        );

        // Update created_by in WalkIn table for reassigned leads
        await WalkIn.update(
          { created_by: assignedTo },
          {
            where: {
              lead_id: {
                [Op.in]: leadsToBeReAssigned.map((lead) => lead.id),
              },
            },
            transaction,
          }
        );
      }

      // lead transfer logic
      let leadTransfers = [];
      let reassignmentActivityLogs = [];
      existingLeads.forEach((lead) => {
        leadTransfers.push({
          lead_id: lead.lead_id,
          transfered_from: lead.assigned_to,
          transfered_to: assignedTo,
          transfered_on: new Date(),
          transfered_by: assignedBy,
        });

        reassignmentActivityLogs.push({
          activity_desc: `Lead reassigned to ${userName}.`,
          activity_type: ACTIVITY_TYPES.LEAD_REASSIGNMENT,
          created_by: assignedBy,
          lead_id: lead.lead_id,
          lead_name: lead.Lead.name,
        });
      });

      if (leadTransfers.length > 0) {
        await LeadTransfer.bulkCreate(leadTransfers, { transaction });
        await Promise.all(
          reassignmentActivityLogs.map((logData) =>
            ActivityLogServices.createActivityLog(logData, transaction)
          )
        );
      }

      const bulkAssignments = leadsToBeReAssigned.map((leadId) => ({
        lead_id: leadId.id,
        assigned_to: assignedTo,
        assigned_by: assignedBy,
        status: "active",
        updatedAt: new Date().toISOString(),
      }));

      await LeadAssignment.bulkCreate(bulkAssignments, {
        updateOnDuplicate: [
          "assigned_to",
          "assigned_by",
          "status",
          "updatedAt",
        ],
        transaction,
      });
    }

    const notification = await saveNotification(
      {
        employee_id: assignedTo,
        notification_from: assigningUser?.name,
        notification_title: 'New Lead Assignment',
        message: `${leadIds.length} leads have been assigned to you.`,
      },
      transaction
    );
    await UserMetricsServices.updateUserMetric(
      assignedTo,
      "assigned_calls",
      leadIds.length,
      transaction
    );
    await transaction.commit();

    const io = getIo();
    io.to(`user_${assignedTo}`).emit("leadAssignment", {
      notification_title: 'New Lead Assignment',
      message: `${leadIds.length} leads have been assigned to you.`,
      assignedBy: userName,
      leadCount: leadIds.length,
      notificationId: notification.id,
    });

    return ApiResponse(res, "SUCCESS", 200, "Leads assigned successfully!", {
      assignedTo: { name: employee.name },
      assignedBy: assigningUser.name,
      assignedLeadIds: leadIds,
    });
  } catch (error) {
    console.error("Error assigning leads to employee:", error);
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to assign leads!",
      null,
      error,
      null
    );
  }
}

async function getLeadsByAssignedUserId(req, res) {
  try {
    // const { assignedTo } = req.params;
    const {
      userId,
      name,
      email,
      phone,
      leadSource,
      lead_source,
      date,
      leadStatus,
      docsCollected,
      assignedBy,
      page = 1, // Default to page 1
      limit = 10, // Default to 10 leads per page
      pageSize = 10,
      exclude_verification,
      last_updated,
      leadId,
      assigned_on,
      lead_status,
      utm_campaign,
      utm_source
    } = req.query;

    // Validate input
    if (!userId) {
      return ApiResponse(res, "error", 400, "Assigned user ID is required!");
    }

    // Verify if the assigned user exists
    const assignedUser = await User.findByPk(userId);
    if (!assignedUser) {
      return ApiResponse(res, "error", 404, "Assigned user not found!");
    }

    // Calculate pagination
    const offset = (page - 1) * (pageSize ? pageSize : limit);

    // Build filters
    const leadFilters = {
      lead_bucket: PIPELINE_ENTRIES
    };
    if (name) leadFilters.name = { [Op.like]: `%${name}%` };
    if (email) leadFilters.email = { [Op.like]: `%${email}%` };
    if (phone) leadFilters.phone = { [Op.like]: `%${phone}%` };
    if (leadId) leadFilters.id = { [Op.like]: `%${leadId}%` };
    if(utm_campaign){
          leadFilters.utm_campaign = { [Op.like]: `%${utm_campaign}%` }
        }
    
        if(utm_source) {
          leadFilters.utm_source = { [Op.like]: `%${utm_source}%` }
        }
    const leadSourceValue = leadSource || lead_source;
    if (leadSourceValue) {
      // leadFilters.lead_source = { [Op.like]: `%${leadSourceValue}%` };
      leadFilters.lead_source = leadSourceValue;
    }
    // Fixed filter logic
    if (leadStatus || lead_status) {
      leadFilters.lead_status = leadStatus || lead_status;
      if (exclude_verification === "true") {
        leadFilters.verification_status = "Under Review";
      }
    } else if (exclude_verification === "true") {
      leadFilters.lead_status = { [Op.in]: [...INITIAL_LEAD_STATUSES] };
      leadFilters.verification_status = "Under Review";
    }

    // Handle date filter (adjusting for UTC vs. local timezone differences)
    // if (date) {
    //   const importedDate = new Date(date);
    //   const startOfDay = new Date(importedDate.setHours(0, 0, 0, 0));
    //   const endOfDay = new Date(importedDate.setHours(23, 59, 59, 999));
    //   leadFilters.createdAt = { [Op.between]: [startOfDay, endOfDay] };
    // }

    const activityFilters = {};
    if (docsCollected !== undefined)
      activityFilters.docs_collected = docsCollected === "1";

    const leadAssignmentFilters = { assigned_to: userId };
    if (assignedBy) leadAssignmentFilters.assigned_by = assignedBy;
    if (date) {
      const startOfDayUTC = moment
        .tz(date, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(date, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      leadAssignmentFilters.createdAt = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
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

        leadAssignmentFilters.updatedAt = {
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

        leadAssignmentFilters.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    if (last_updated) {
      const [startRange, endRange] = last_updated.split(",");

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

        leadAssignmentFilters.updatedAt = {
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

        leadAssignmentFilters.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    // Step 1: Fetch the total count of leads without activities to avoid inflated count due to join
    const { count } = await LeadAssignment.findAndCountAll({
      where: leadAssignmentFilters,
      include: [
        {
          model: Lead,
          as: "Lead",
          where: leadFilters,
          attributes: ["id"], // Only fetch the lead id to count leads
        },
      ],
      order: [
        ["createdAt", "DESC"], // Sort leads by creation date descending
        ["id", "DESC"], // Break tie with id if needed
      ],
    });

    // Fetch leads count (without activities)
    const { rows } = await LeadAssignment.findAndCountAll({
      where: leadAssignmentFilters,
      include: [
        {
          model: Lead,
          as: "Lead",
          where: leadFilters,
          attributes: [
            "id",
            "name",
            "email",
            "phone",
            "lead_source",
            "createdAt",
            "lead_status",
            "updatedAt",
            "lead_bucket"
          ],
          include: [
            {
              model: Activity,
              as: "Activities",
              where: activityFilters,
              required: false, // Allow leads without activities
              attributes: [
                "id",
                "activity_status",
                "docs_collected",
                "description",
                "createdAt",
                "follow_up",
              ],
              order: [
                ["createdAt", "DESC"],
                ["id", "DESC"],
              ], // Order activities by createdAt and then by id in descending order
            },
          ],
        },
        {
          model: User,
          as: "assignedBy", // Alias for User who assigned the lead
          attributes: ["id", "name", "email"],
        },
      ],
      order: [
        ["createdAt", "DESC"], // Sort leads by creation date descending
        ["id", "DESC"], // Break tie with id if needed
      ],
      limit: parseInt(pageSize ? pageSize : limit), // Limit to the page size
      offset: parseInt(offset), // Calculate the offset based on page and limit
    });

    // Correctly calculate total pages based on the real count
    const totalPages = Math.ceil(count / limit);

    // Format response data
    const leads = rows?.map((assignment) => ({
      id: assignment.Lead.id,
      name: assignment.Lead.name,
      email: assignment.Lead.email,
      phone: assignment.Lead.phone,
      leadSource: assignment.Lead.lead_source,
      leadStatus: assignment.Lead.lead_status,
      leadBucket: assignment.Lead.lead_bucket,
      importedOn: assignment.Lead.createdAt,
      assignedAt: assignment.updatedAt,
      assignedBy: {
        userId: assignment.assignedBy?.id || null,
        name: assignment.assignedBy?.name || null,
        email: assignment.assignedBy?.email || null,
      },
      updatedAt: assignment.Lead.updatedAt,
      activities: assignment.Lead.Activities
        ? assignment.Lead.Activities.map((activity) => ({
            activityId: activity.id,
            activity_status: activity.activity_status,
            docsCollected: activity.docs_collected,
            description: activity.description,
            createdAt: activity.createdAt,
            followUp: activity.follow_up,
          })).sort((a, b) => b.activityId - a.activityId)
        : [],
    }));

    // Pagination info
    console.log("Total leads count:", count);
    const pagination = {
      total: count,
      page: parseInt(page),
      totalPages,
      pageSize: parseInt(pageSize ? pageSize : limit),
    };

    return ApiResponse(
      res,
      "success",
      200,
      "Leads retrieved successfully!",
      leads,
      null,
      pagination
    );
  } catch (error) {
    console.error("Error fetching leads by assigned user ID:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to retrieve leads",
      null,
      error,
      null
    );
  }
}

module.exports = {
  assignLeadsToEmployee,
  getLeadsByAssignedUserId,
};
