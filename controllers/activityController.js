const { Op, where } = require("sequelize");
const moment = require("moment-timezone");
const {
  sequelize,
  User,
  Lead,
  Activity,
  LeadAssignment,
} = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const {
  createActivityLog,
  createLogData,
} = require("../services/ActivityLogServices");
const {
  ACTIVITY_LOGS,
  ACTIVITY_TYPES,
} = require("../utilities/ActivityLogConstants");
const UserMetricsServices = require("../services/UserMetricsServices");

async function addActivity(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      userId = null,
      leadId = null,
      activity_status, // Mandatory field
      description = null,
      docsCollected = 0, // Default to 0
      followUp = null,
      lead_status = null,
      prev_status,
      lead_name,
      from_activity_logs_page = false,
    } = req.body;

    // Validate mandatory fields
    if (!activity_status) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "activity_status is required!",
        null,
        null
      );
    }

    let existingActivity;
    if (leadId) {
      existingActivity = await Activity.findOne({
        where: { lead_id: leadId },
        order: [["id", "DESC"]],
        transaction,
      });
    }

    let newDocsCollected = docsCollected;
    if (existingActivity && existingActivity.docs_collected === true) {
      newDocsCollected = existingActivity.docs_collected;
    }

    if (leadId) {
      const lead = await Lead.findByPk(leadId, { transaction });
      if (!lead) {
        await transaction.rollback();
        return ApiResponse(res, "error", 404, "Lead not found!", null, null);
      }

      let pendingActivity = null;
      if (
        ["Follow Up", "Call Back", "Scheduled Call With Manager"].includes(
          activity_status
        )
      ) {
        pendingActivity = await Activity.findOne({
          where: {
            lead_id: leadId,
            activity_status: {
              [Op.in]: [
                "Follow Up",
                "Call Back",
                "Scheduled Call With Manager",
              ],
            },
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

      // Create Activity **ONLY AFTER CHECKING pendingActivity**
      const activity = await Activity.create(
        {
          lead_id: leadId,
          activity_status,
          description,
          docs_collected: newDocsCollected,
          created_by: userId,
          follow_up: followUp,
          lead_status,
        },
        { transaction }
      );

      await UserMetricsServices.updateUserMetric(
        userId,
        "calls_done",
        1,
        transaction
      );
      if (activity_status === "Interested") {
        await UserMetricsServices.updateUserMetric(
          userId,
          "interested",
          1,
          transaction
        );
      }
      if (
        ![
          "Not Contacted",
          "RNR ( Ring No Response )",
          "Switched Off",
          "Busy",
          "Not Working / Not Reachable",
        ].includes(activity_status)
      ) {
        await UserMetricsServices.updateUserMetric(
          userId,
          "connected_calls",
          1,
          transaction
        );
      }

      // Update Lead Status
      lead.setDataValue("updatedAt", new Date().toISOString());

      // Always update last_updated_status
      const updatePayload = {
        last_updated_status: activity_status,
        updatedAt: new Date().toISOString(),
      };

      // Only update lead_status if not coming from activity logs
      if (!from_activity_logs_page) {
        updatePayload.lead_status = activity_status;
      }

      // Add lead_bucket for Verification 1
      if (activity_status === "Verification 1") {
        updatePayload.lead_bucket = "PRELIMINERY_CHECK";
      }

      await lead.update(updatePayload, { transaction });

      let logData = null;
      if (
        ["Follow Up", "Call Back", "Scheduled Call With Manager"].includes(
          activity_status
        )
      ) {
        let logDataForTask = createLogData(
          ACTIVITY_LOGS.TASK_CREATE(activity_status, followUp),
          ACTIVITY_TYPES.TASK_CREATE,
          userId,
          leadId,
          description,
          lead_name
        );
        if (!from_activity_logs_page) {
          logData = createLogData(
            ACTIVITY_LOGS.LEAD_STATUS_UPDATE(prev_status, activity_status),
            ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
            userId,
            leadId,
            description,
            lead_name
          );
        }
        await createActivityLog(logDataForTask, transaction);
      } else {
        if (!from_activity_logs_page) {
          logData = createLogData(
            ACTIVITY_LOGS.LEAD_STATUS_UPDATE(prev_status, activity_status),
            ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
            userId,
            leadId,
            description,
            lead_name
          );
        }
      }

      if (logData !== null) {
        await createActivityLog(logData, transaction);
      }

      // ✅ Commit the transaction **AFTER all updates**
      await transaction.commit();

      return ApiResponse(
        res,
        "success",
        201,
        "Activity added successfully!",
        {
          activityId: activity.id,
          description: activity.description,
          activity_status: activity.activity_status,
          docs_collected: activity.docs_collected,
          follow_up: activity.follow_up,
          createdAt: activity.createdAt,
          updatedAt: activity.updatedAt,
          lead_status: activity.lead_status,
        },
        null
      );
    }
  } catch (error) {
    // 🔴 Prevent rollback on already committed transactions
    if (transaction.finished !== "commit") {
      await transaction.rollback();
    }
    console.error("Error adding activity:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to add activity!",
      null,
      error
    );
  }
}

async function getActivitiesByLeadId(req, res) {
  try {
    const { leadId } = req.params; // Extract leadId from request params
    console.log("Received lead ID:", leadId);

    // Validate the leadId
    if (!leadId) {
      return ApiResponse(
        res,
        "error",
        400,
        "Lead ID is required",
        null,
        null,
        null
      );
    }

    // Fetch activities for the given leadId, including createdBy details
    const activities = await Activity.findAll({
      where: { lead_id: leadId }, // Filter activities by lead_id
      include: [
        {
          model: User, // Assuming User is the model for the user table
          as: "CreatedBy", // Alias for the relationship
          required: false, // Include even if no matching user is found
          attributes: ["id", "name"], // Include only the ID and name of the user
        },
      ],
      order: [
        ["id", "DESC"], // Order by activity ID in descending order
        ["createdAt", "DESC"], // Order by createdAt in descending order
      ],
    });

    // Return the activities in the response
    return ApiResponse(
      res,
      "success",
      200,
      "Activities fetched successfully",
      activities,
      null,
      null
    );
  } catch (error) {
    console.error("Error fetching activities:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch activities",
      null,
      error,
      null
    );
  }
}

async function updateActivityByActivityId(req, res) {
  try {
    const { activityId } = req.params;
    const {
      activity_status,
      description,
      docs_collected,
      follow_up,
      createdBy,
      lead_status,
    } = req.body;

    // Validate that required fields are provided
    if (!activityId) {
      return ApiResponse(res, "error", 400, "Activity ID is required!");
    }

    if (!activity_status) {
      return ApiResponse(res, "error", 400, "Activity status is required!");
    }

    if (!createdBy) {
      return ApiResponse(res, "error", 400, "CreatedBy is required!");
    }

    // Validate the activity status value
    const validStatuses = ["new", "in_progress", "completed", "follow_up"];
    if (!validStatuses.includes(activity_status)) {
      return ApiResponse(res, "error", 400, "Invalid activity status!");
    }

    // Update the activity fields directly in the database
    const [updatedRows] = await Activity.update(
      {
        activity_status,
        description,
        docs_collected: docs_collected !== undefined ? docs_collected : 0,
        follow_up: follow_up ? new Date(follow_up) : null,
        updatedBy: createdBy, // assuming that `createdBy` refers to the person updating the activity
        lead_status,
      },
      {
        where: { id: activityId },
        returning: true, // This returns the updated rows
      }
    );

    // If no rows were updated, return a not found response
    if (updatedRows === 0) {
      return ApiResponse(res, "error", 404, "Activity not found!");
    }

    // Return the updated activity data
    const updatedActivity = updatedRows[0];
    return ApiResponse(
      res,
      "success",
      200,
      "Activity updated successfully",
      updatedActivity
    );
  } catch (error) {
    console.error("Error updating activity by ID:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update activity",
      null,
      error.message
    );
  }
}

async function getAllActivities(req, res) {
  try {
    let {
      page = 1,
      pageSize = 25,
      activity_status,
      createdAt,
      created_by,
      phone,
      assigned_to,
      isPaginationOff = "false",
    } = req.query;

    page = parseInt(page);
    pageSize = parseInt(pageSize);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const whereConditions = {};
    const leadConditions = {};
    if (activity_status)
      whereConditions.activity_status = { [Op.like]: `%${activity_status}%` };
    if (created_by) whereConditions.created_by = created_by;

    if (createdAt) {
      const [startRange, endRange] = createdAt.split(",");
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

    if (phone) {
      leadConditions.phone = { [Op.like]: `%${phone}%` };
    }

    if (assigned_to) {
      whereConditions.created_by = assigned_to;
    }

    const includeConditions = [
      {
        model: Lead,
        as: "Lead",
        where: leadConditions,
        required: true, // Ensure activity must be linked to a lead.
        include: [
          {
            model: LeadAssignment,
            as: "LeadAssignments",
            required: false, // Include even if there's no LeadAssignment.
            include: [
              {
                model: User,
                as: "AssignedTo",
                attributes: ["id", "name"], // Include only AssignedTo details.
              },
            ],
          },
        ],
      },
    ];

    const isPaginationEnabled = isPaginationOff === "false";

    const { count, rows } = await Activity.findAndCountAll({
      where: whereConditions,
      include: includeConditions,
      order: [["createdAt", "DESC"]],
      limit: isPaginationEnabled ? pageSize : null,
      offset: isPaginationEnabled ? (page - 1) * pageSize : null,
      distinct: true,
    });

    const totalPages = Math.ceil(count / pageSize);
    const pagination = {
      page,
      totalPages,
      total: count,
      pageSize,
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Activities fetched successfully",
      rows,
      null,
      pagination
    );
  } catch (error) {
    console.error("Error fetching activities:", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to fetch activities!",
      null,
      error,
      null
    );
  }
}

async function getAllTasks(req, res) {
  const transaction = await sequelize.transaction();
  try {
    let {
      page = 1,
      pageSize = 25,
      created_by,
      follow_up,
      follow_up_range,
      task_type,
      task_status,
    } = req.query;

    let activity_statuses = task_type
      ? [task_type]
      : ["Follow Up", "Call Back", "Scheduled Call With Manager"];

    // Validate pagination params
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const includeConditions = [
      {
        model: Lead,
        as: "Lead",
        required: true,
        include: [
          {
            model: LeadAssignment,
            as: "LeadAssignments",
            required: false,
            include: [
              {
                model: User,
                as: "AssignedTo",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
    ];

    let whereConditions = {
      activity_status: { [Op.in]: activity_statuses },
      task_status: { [Op.ne]: "Completed" },
    };

    if (created_by) {
      whereConditions.created_by = created_by;
    }

    if (task_status) {
      whereConditions.task_status = task_status;
    }

    await Activity.update(
      { task_status: "Pending" },
      {
        where: {
          follow_up: { [Op.lt]: moment().utc().toDate() },
          task_status: "Upcoming",
        },
        transaction,
      }
    );

    // Handle `follow_up_range` (date range filter)
    if (follow_up_range) {
      const [startRange, endRange] = follow_up_range.split(",");

      if (startRange && endRange) {
        const startOfRangeUTC = moment
          .tz(startRange, "YYYY-MM-DD", "Asia/Kolkata")
          .startOf("day")
          .utc()
          .toDate();
        const endOfRangeUTC = moment
          .tz(endRange, "YYYY-MM-DD", "Asia/Kolkata")
          .endOf("day")
          .utc()
          .toDate();

        whereConditions.follow_up = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      } else {
        // If only a single date is provided in `follow_up_range`
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

        whereConditions.follow_up = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }
    // Handle `follow_up` (single date filter)
    else if (follow_up) {
      const followUpStartUTC = moment
        .tz(follow_up, "YYYY-MM-DD", "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const followUpEndUTC = moment
        .tz(follow_up, "YYYY-MM-DD", "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();

      whereConditions.follow_up = {
        [Op.between]: [followUpStartUTC, followUpEndUTC],
      };
    }

    // Fetch tasks with applied conditions
    const tasks = await Activity.findAll({
      where: whereConditions,
      include: includeConditions,
      order: [["createdAt", "DESC"]],
      transaction,
    });

    // Paginate results
    const paginatedTasks = tasks.slice((page - 1) * pageSize, page * pageSize);

    const pagination = {
      page,
      totalPages: Math.ceil(tasks.length / pageSize),
      total: tasks.length,
      pageSize,
    };

    await transaction.commit();
    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Tasks fetched successfully",
      paginatedTasks,
      null,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks:", error.stack);
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to fetch tasks!",
      null,
      error,
      null
    );
  }
}

async function updateTaskStatus(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { task_status, activity_id, task_type, user_id, lead_id, lead_name } =
      req.body;

    // Validate request body
    if (!task_status || !activity_id) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "Task Status and Activity ID are required!",
        null,
        null,
        null
      );
    }

    // Update task_status in the Activity model
    const updatedActivity = await Activity.update(
      { task_status }, // Fields to update
      { where: { id: activity_id }, transaction } // Condition
    );

    let logData = createLogData(
      ACTIVITY_LOGS.TASK_UPDATE(task_type, task_status),
      ACTIVITY_TYPES.TASK_UPDATE,
      user_id,
      lead_id,
      null,
      lead_name
    );

    await createActivityLog(logData, transaction);

    // Check if the update was successful
    if (updatedActivity[0] === 0) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        404,
        "Activity not found or no changes made!",
        null,
        null,
        null
      );
    }
    await transaction.commit();
    return ApiResponse(
      res,
      "success",
      200,
      "Task Status updated successfully!",
      { task_status, activity_id },
      null,
      null
    );
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update Task Status!",
      null,
      error,
      null
    );
  }
}

async function updateDocsCollectedByActivityId(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { docs_collected, activity_id, user_id, lead_id } = req.body;

    if (typeof docs_collected === "undefined" || !activity_id) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    const [updatedCount] = await Activity.update(
      { docs_collected },
      { where: { id: activity_id }, transaction }
    );

    if (updatedCount === 0) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "Activity Not Found or No Changes Made !"
      );
    }

    let logData = createLogData(
      ACTIVITY_LOGS.DOCUMENTS_COLLECTED(docs_collected),
      ACTIVITY_TYPES.DOCUMENTS_COLLECTED,
      user_id,
      lead_id
    );

    await createActivityLog(logData, transaction);
    await transaction.commit();
    return ApiResponse(
      res,
      "success",
      200,
      "Docs Collected field updated successfully!"
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update docs collected field !",
      null,
      error,
      null
    );
  }
}

async function getRecentActivityNotesByLeadId(req, res) {
  try {
    const { leadId, limit = 10 } = req.query;

    if (!leadId) {
      return ApiResponse(
        res,
        "error",
        400,
        "Lead ID is required!",
        null,
        null,
        null
      );
    }

    const activities = await Activity.findAll({
      where: {
        lead_id: leadId,
        description: { [Op.ne]: null }, // Ensures description is not null
        status: "active", // Fetch only active activities (optional)
      },
      limit: limit ? parseInt(limit) : 10, // Default limit to 10 if not provided
      order: [["createdAt", "DESC"]], // Fetch recent activities first
    });

    return ApiResponse(
      res,
      "success",
      200,
      "Activity notes fetched successfully!",
      activities,
      null,
      null
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch activity notes!",
      null,
      error,
      null
    );
  }
}

async function getRecentActivityByLeadId(req, res) {
  try {
    const { leadId } = req.query;

    if (!leadId) {
      return ApiResponse(
        res,
        "error",
        400,
        "Lead ID is required!",
        null,
        null,
        null
      );
    }

    const activities = await Activity.findAll({
      where: {
        lead_id: leadId,
        status: "active", // Fetch only active activities (optional)
      },
      limit: 1, // Default limit to 10 if not provided
      order: [["createdAt", "DESC"]], // Fetch recent activities first
    });

    return ApiResponse(
      res,
      "success",
      200,
      "Activity notes fetched successfully!",
      activities[0],
      null,
      null
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch activity notes!",
      null,
      error,
      null
    );
  }
}

module.exports = {
  addActivity,
  getActivitiesByLeadId,
  updateActivityByActivityId,
  getAllActivities,
  getAllTasks,
  updateTaskStatus,
  updateDocsCollectedByActivityId,
  getRecentActivityNotesByLeadId,
  getRecentActivityByLeadId,
};
