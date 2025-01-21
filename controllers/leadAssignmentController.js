const { Op } = require("sequelize");
const moment = require("moment-timezone");
const {
  sequelize,
  LeadAssignment,
  Lead,
  User,
  Activity,
} = require("../models"); // Adjust paths as needed
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { INITIAL_LEAD_STATUSES } = require("../utilities/constants");
const ActivityLogServices = require('../services/ActivityLogServices')
const {ACTIVITY_LOGS,ACTIVITY_TYPES} = require('../utilities/ActivityLogConstants')

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

    // Fetch the assigned employee and assigning user (no validation needed if they exist in DB)
    const [employee, assigningUser] = await Promise.all([
      User.findByPk(assignedTo),
      User.findByPk(assignedBy),
    ]);

    // Validate that employee and assigning user exist
    if (!employee) {
      return ApiResponse(res, "ERROR", 404, "Assigned employee not found!");
    }
    if (!assigningUser) {
      return ApiResponse(res, "ERROR", 404, "Assigning user not found!");
    }

    // Prepare bulk upsert data for lead assignments
    const bulkAssignments = leadIds.map((leadId) => ({
      lead_id: leadId,
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      status: "active",
    }));

    // Bulk insert or update assignments
    await LeadAssignment.bulkCreate(bulkAssignments, {
      updateOnDuplicate: ["assigned_to", "assigned_by", "status"],
      transaction,
    });

    const activityLogs = leadIds.map((leadId) => ({
      activity_desc:ACTIVITY_LOGS.ASSIGN_LEAD(leadId, assignedTo, assignedBy),
      activity_type:ACTIVITY_TYPES.LEAD_ASSIGNMENT,
      created_by: assignedBy,
      lead_id: leadId
    }))

    await Promise.all(
      activityLogs.map((logData) => ActivityLogServices.createActivityLog(logData, transaction))
    )

    // Commit transaction
    await transaction.commit();

    // Return response with the assigned employee's name
    return ApiResponse(res, "SUCCESS", 200, "Leads assigned successfully!", {
      assignedTo: {
        name: employee.name,  // Return the assigned employee's name
      },
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
      exclude_verification
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
      leadFilters.lead_status = { [Op.like]: `%${leadStatus}%` };
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
          attributes: ['id', 'name', 'email', 'phone', 'lead_source', 'createdAt', 'lead_status'],
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
