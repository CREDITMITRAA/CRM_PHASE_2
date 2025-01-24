const { Op, Sequelize } = require("sequelize");
const moment = require("moment-timezone");
const {
  sequelize,
  LeadAssignment,
  Lead,
  User,
  Activity,
  LeadTransfer,
} = require("../models"); // Adjust paths as needed
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { INITIAL_LEAD_STATUSES } = require("../utilities/constants");
const ActivityLogServices = require('../services/ActivityLogServices')
const {ACTIVITY_LOGS,ACTIVITY_TYPES} = require('../utilities/ActivityLogConstants');

async function assignLeadsToEmployee(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { leadIds, assignedTo, assignedBy } = req.body;

    // Validate input
    if (
      !Array.isArray(leadIds) ||
      leadIds.length === 0 ||
      !assignedTo ||
      !assignedBy
    ) {
      return ApiResponse(res, "ERROR", 400, "Missing required fields!");
    }

    // Fetch the assigned employee and assigning user
    const [employee, assigningUser] = await Promise.all([
      User.findByPk(assignedTo),
      User.findByPk(assignedBy),
    ]);

    if (!employee) {
      return ApiResponse(res, "ERROR", 404, "Assigned employee not found!");
    }
    if (!assigningUser) {
      return ApiResponse(res, "ERROR", 404, "Assigning user not found!");
    }

    // Find existing leads
    const existingLeads = await LeadAssignment.findAll({
      where: { lead_id: leadIds },
      attributes: ["lead_id", "assigned_to"],
      transaction,
    });

    // Unwanted activity statuses
    const unwantedStatuses = ["RNR ( Ring No Response )", "Switched Off", "Busy", "Not Interested", "Not Working / Not Reachable"];

    // Fetch activities with unwanted statuses for the selected leads
    const unwantedActivities = await Activity.findAll({
      where: {
        lead_id: leadIds,
        activity_status: {
          [Sequelize.Op.in]: unwantedStatuses,  // Only activities with the unwanted statuses
        },
      },
      attributes: ["id", "lead_id", "createdAt"],
      order: [["createdAt", "DESC"]], // Sort by latest activity
      transaction,
    });

    // Filter the most recent unwanted activities for each lead
    const recentUnwantedActivities = unwantedActivities.reduce((acc, activity) => {
      if (!acc[activity.lead_id] || acc[activity.lead_id].createdAt < activity.createdAt) {
        acc[activity.lead_id] = activity;
      }
      return acc;
    }, {});

    // Remove unwanted activities from the database
    const unwantedActivityIds = Object.values(unwantedActivities).map(
      (activity) => activity.id
    );

    if (unwantedActivityIds.length > 0) {
      await Activity.destroy({
        where: { id: unwantedActivityIds },
        transaction,
      });
    }

    // Update lead statuses in the Leads table
    const leadsToUpdate = Object.keys(recentUnwantedActivities);
    if (leadsToUpdate.length > 0) {
      await Lead.update(
        { lead_status: "Not Contacted" },
        {
          where: { id: leadsToUpdate },
          transaction,
        }
      );
    }

    // Map existing leads for easier lookup
    const existingLeadMap = new Map(
      existingLeads.map((lead) => [lead.lead_id, lead.assigned_to])
    );

    // Prepare transfer history records and reassignment activity logs
    const leadTransfers = [];
    const reassignmentActivityLogs = [];
    existingLeads.forEach((lead) => {
      leadTransfers.push({
        lead_id: lead.lead_id,
        transfered_from: lead.assigned_to,
        transfered_to: assignedTo,
        transfered_on: new Date(),
        transfered_by: assignedBy,
      });

      reassignmentActivityLogs.push({
        activity_desc: `Lead ID ${lead.lead_id} reassigned from Employee ID ${lead.assigned_to} to Employee ID ${assignedTo} by Employee ID ${assignedBy}.`,
        activity_type: ACTIVITY_TYPES.LEAD_REASSIGNMENT,
        created_by: assignedBy,
        lead_id: lead.lead_id,
      });
    });

    if (leadTransfers.length > 0) {
      await LeadTransfer.bulkCreate(leadTransfers, { transaction });
    }

    const bulkAssignments = leadIds.map((leadId) => ({
      lead_id: leadId,
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      status: "active",
      updatedAt: new Date().toISOString(),
    }));

    await LeadAssignment.bulkCreate(bulkAssignments, {
      updateOnDuplicate: ["assigned_to", "assigned_by", "status", "updatedAt"],
      transaction,
    });

    const newAssignmentActivityLogs = leadIds
      .filter((leadId) => !existingLeadMap.has(leadId))
      .map((leadId) => ({
        activity_desc: ACTIVITY_LOGS.ASSIGN_LEAD(leadId, assignedTo, assignedBy),
        activity_type: ACTIVITY_TYPES.LEAD_ASSIGNMENT,
        created_by: assignedBy,
        lead_id: leadId,
      }));

    const allActivityLogs = [...newAssignmentActivityLogs, ...reassignmentActivityLogs];

    await Promise.all(
      allActivityLogs.map((logData) =>
        ActivityLogServices.createActivityLog(logData, transaction)
      )
    );

    await transaction.commit();

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
      "Failed to assign leads!",
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
      date,
      leadStatus,
      docsCollected,
      assignedBy,
      page = 1, // Default to page 1
      limit = 10, // Default to 10 leads per page
      exclude_verification,
      last_updated
    } = req.query;

    // Validate input
    if (!userId) {
      return ApiResponse(res, 'error', 400, 'Assigned user ID is required!');
    }

    // Verify if the assigned user exists
    const assignedUser = await User.findByPk(userId);
    if (!assignedUser) {
      return ApiResponse(res, 'error', 404, 'Assigned user not found!');
    }

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Build filters
    const leadFilters = {};
    if (name) leadFilters.name = { [Op.like]: `%${name}%` };
    if (email) leadFilters.email = { [Op.like]: `%${email}%` };
    if (phone) leadFilters.phone = { [Op.like]: `%${phone}%` };
    if (leadSource) leadFilters.lead_source = { [Op.like]: `%${leadSource}%` };
    if (leadStatus) {
      leadFilters.lead_status = leadStatus
    } else if (exclude_verification === 'true') {
      // Exclude leads with status "Verification 1"
      leadFilters.lead_status = { [Op.in]: [...INITIAL_LEAD_STATUSES] };
    }

    // Handle date filter (adjusting for UTC vs. local timezone differences)
    // if (date) {
    //   const importedDate = new Date(date);
    //   const startOfDay = new Date(importedDate.setHours(0, 0, 0, 0));
    //   const endOfDay = new Date(importedDate.setHours(23, 59, 59, 999));
    //   leadFilters.createdAt = { [Op.between]: [startOfDay, endOfDay] };
    // }

    const activityFilters = {};
    if (docsCollected !== undefined) activityFilters.docs_collected = docsCollected === '1';

    const leadAssignmentFilters = { assigned_to: userId };
    if (assignedBy) leadAssignmentFilters.assigned_by = assignedBy;
    if(date){
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

    if(last_updated){
      const startOfDayUTC = moment
              .tz(last_updated, "Asia/Kolkata")
              .startOf("day")
              .utc()
              .toDate();
      const endOfDayUTC = moment
              .tz(last_updated, "Asia/Kolkata")
              .endOf("day")
              .utc()
              .toDate();
              leadFilters.updatedAt = {
              [Op.between]: [startOfDayUTC, endOfDayUTC],
            };
    }

    // Step 1: Fetch the total count of leads without activities to avoid inflated count due to join
    const { count } = await LeadAssignment.findAndCountAll({
      where: leadAssignmentFilters,
      include: [
        {
          model: Lead,
          as: 'Lead',
          where: leadFilters,
          attributes: ['id'], // Only fetch the lead id to count leads
        },
      ],
      order: [
        ['createdAt', 'DESC'], // Sort leads by creation date descending
        ['id', 'DESC'], // Break tie with id if needed
      ],
    });

    // Fetch leads count (without activities)
    const { rows } = await LeadAssignment.findAndCountAll({
      where: leadAssignmentFilters,
      include: [
        {
          model: Lead,
          as: 'Lead',
          where: leadFilters,
          attributes: ['id', 'name', 'email', 'phone', 'lead_source', 'createdAt', 'lead_status', "updatedAt"],
          include: [
            {
              model: Activity,
              as: 'Activities',
              where: activityFilters,
              required: false, // Allow leads without activities
              attributes: ['id', 'activity_status', 'docs_collected', 'description', 'createdAt', "follow_up"],
              order: [['createdAt', 'DESC'], ['id', 'DESC']], // Order activities by createdAt and then by id in descending order
            },
          ],
        },
        {
          model: User,
          as: 'assignedBy', // Alias for User who assigned the lead
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [
        ['createdAt', 'DESC'], // Sort leads by creation date descending
        ['id', 'DESC'], // Break tie with id if needed
      ],
      limit: parseInt(limit), // Limit to the page size
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
      importedOn: assignment.Lead.createdAt,
      assignedAt: assignment.createdAt,
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
          })).sort((a,b)=>b.activityId - a.activityId)
        : [],
    }));

    // Pagination info
    console.log("Total leads count:", count);
    const pagination = {
      total: count,
      page: parseInt(page),
      totalPages,
      limit: parseInt(limit),
    };

    return ApiResponse(res, 'success', 200, 'Leads retrieved successfully!', leads, null, pagination);
  } catch (error) {
    console.error('Error fetching leads by assigned user ID:', error);
    return ApiResponse(res, 'error', 500, 'Failed to retrieve leads', null, error, null);
  }
}

module.exports = {
  assignLeadsToEmployee,
  getLeadsByAssignedUserId,
};
