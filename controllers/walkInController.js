const { Op, where } = require("sequelize");
const { WalkIn, Lead, LeadAssignment, User, sequelize } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const moment = require("moment-timezone");
const walkIn = require("../models/walkIn");
const { createLogData, createActivityLog } = require("../services/ActivityLogServices");
const { ACTIVITY_LOGS, ACTIVITY_TYPES } = require("../utilities/ActivityLogConstants");
const e = require("cors");

async function scheduleWalkIn(req, res) {
  const transaction = await sequelize.transaction()
  try {
    const {
      lead_id,
      walk_in_status,
      walk_in_date_time,
      is_rescheduled,
      rescheduled_date_time,
      note,
      created_by,
      is_call=false,
      lead_name
    } = req.body;

    if (!lead_id || !walk_in_date_time || !created_by) {
      await transaction.rollback()
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    const lead = await Lead.findByPk(lead_id, {transaction})
    if (!lead) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Lead not found!");
    }

    let updatePayload = {}
    if(is_call){
      updatePayload = {
        lead_status: "Scheduled Call With Manager",
        // verification_status:"Scheduled Call With Manager",
        last_updated_status:"Scheduled Call With Manager",
        lead_bucket: "APPOINTMENTS",
      }
    }else{
      updatePayload = {
        lead_status: "Scheduled For Walk-In",
        // verification_status:"Scheduled For Walk-In",
        last_updated_status:"Scheduled For Walk-In",
        lead_bucket: "APPOINTMENTS",
      }
    }
    await lead.update(updatePayload, { transaction });

    const savedWalkIn = await WalkIn.create({
      lead_id,
      walk_in_status,
      walk_in_date_time,
      is_rescheduled,
      rescheduled_date_time,
      note,
      created_by,
      is_call
     },
     {transaction}
  );

    let logData = createLogData(
        is_call ? ACTIVITY_LOGS.CALL_SCHEDULE_WITH_MANAGER(walk_in_date_time) : ACTIVITY_LOGS.WALK_IN_SCHEDULE(walk_in_date_time),
        is_call ? ACTIVITY_TYPES.CALL_SCHEDULE_WITH_MANAGER : ACTIVITY_TYPES.WALK_IN_SCHEDULE,
        created_by,
        lead_id,
        note,
        lead_name
      )

    await createActivityLog(logData, transaction)
    await transaction.commit()

    return ApiResponse(res,"success",201,"Walk In scheduled successfully.",savedWalkIn,null,null);
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.log(error);
    return ApiResponse(res,"error",500, error?.message || "Failed to schedule a walk in !",null,error,null);
  }
}

async function getWalkIns(req, res) {
  const transaction = await sequelize.transaction();
  try {
    let { page = 1, pageSize = 10, created_by, date, walk_in_status, date_time_range } = req.query;
    let whereConditions = {
      walk_in_status: {
        [Op.notIn]: ["Completed", "Cancelled"]
      }
    };
    
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    // Default validation to prevent non-integer inputs
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;
    const offset = (page - 1) * pageSize;

    // Apply filters if they exist
    if (created_by) {
      whereConditions.created_by = created_by;
    }

    if (walk_in_status) {
      whereConditions.walk_in_status = walk_in_status;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      whereConditions[Op.or] = [
        {
          walk_in_date_time: {
            [Op.between]: [startDate, endDate]
          }
        },
        {
          rescheduled_date_time: {
            [Op.between]: [startDate, endDate]
          }
        }
      ];
    }

    if (date_time_range) {
      const [startDateTime, endDateTime] = date_time_range.split(',');
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      
      whereConditions[Op.or] = [
        {
          walk_in_date_time: {
            [Op.between]: [startDate, endDate]
          }
        },
        {
          rescheduled_date_time: {
            [Op.between]: [startDate, endDate]
          }
        }
      ];
    }

    // Fetch walk-ins with associated data
    const { rows, count } = await WalkIn.findAndCountAll({
      where: whereConditions,
      order: [
        [sequelize.literal("rescheduled_date_time IS NOT NULL"), "DESC"],
        ["walk_in_date_time", "DESC"],
      ],
      limit: pageSize,
      offset: offset,
      distinct: true,
      include: [
        {
          model: Lead,
          as: "lead",
          attributes: ["id", "name", "phone", "lead_status", "verification_status", "lead_bucket"],
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
      ],
      transaction
    });

    const currentDateTime = new Date(new Date().toISOString());
    
    // Identify walk-ins that need updating (only if we're not filtering by status)
    const walkInsToUpdate = !walk_in_status ? rows.filter(walkIn => {
      const checkDate = walkIn.is_rescheduled ? walkIn.rescheduled_date_time : walkIn.walk_in_date_time;
      return checkDate && checkDate < currentDateTime && 
             ["Upcoming", "Rescheduled"].includes(walkIn.walk_in_status);
    }) : [];

    if (walkInsToUpdate.length > 0) {
      // Bulk update walk-ins
      await WalkIn.update(
        { walk_in_status: "Pending" },
        {
          where: {
            id: { [Op.in]: walkInsToUpdate.map(w => w.id) }
          },
          transaction
        }
      );

      // Process leads in bulk with appropriate status text
      const leadUpdates = walkInsToUpdate.map(walkIn => {
        const statusText = walkIn.is_call ? "Advisor Consultation Pending" : "Appointment Pending";
        return {
          id: walkIn.lead.id,
          lead_status: statusText,
          last_updated_status: statusText
        };
      });

      // Group by status to minimize update queries
      const statusGroups = {};
      leadUpdates.forEach(update => {
        const key = update.lead_status;
        if (!statusGroups[key]) {
          statusGroups[key] = [];
        }
        statusGroups[key].push(update.id);
      });

      // Execute updates for each status group
      for (const [status, leadIds] of Object.entries(statusGroups)) {
        await Lead.update(
          {
            lead_status: status,
            last_updated_status: status
          },
          {
            where: {
              id: { [Op.in]: leadIds }
            },
            transaction
          }
        );
      }

      // Update the status in our response data
      walkInsToUpdate.forEach(walkIn => {
        walkIn.walk_in_status = "Pending";
        if (walkIn.lead) {
          const statusText = walkIn.is_call ? "Advisor Consultation Pending" : "Appointment Pending";
          walkIn.lead.lead_status = statusText;
          walkIn.lead.last_updated_status = statusText;
        }
      });
    }

    const totalPages = Math.ceil(count / pageSize);
    let pagination = {
      page: page,
      totalPages: totalPages,
      total: count,
      pageSize,
    };

    await transaction.commit();
    return ApiResponse(
      res,
      "success",
      200,
      "Walk-Ins fetched successfully",
      rows,
      null,
      pagination
    );
  } catch (error) {
    console.log(error);
    await transaction.rollback();
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch walk-ins!",
      null,
      error,
      null
    );
  }
}

async function updateWalkInStatus(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { walk_in_id, walk_in_status, user_id, lead_id, lead_name, is_call } = req.body;

    // Check if the necessary data is provided
    if (!walk_in_id || !walk_in_status) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    // Find the walk-in with its associated lead
    const walkIn = await WalkIn.findOne({
      where: { id: walk_in_id },
      include: [{
        model: Lead,
        as: "lead",
        transaction
      }],
      transaction
    });

    if (!walkIn) {
      await transaction.rollback();
      return ApiResponse(res, "error", 404, "Walk-in not found");
    }

    // Update walk-in status
    walkIn.walk_in_status = walk_in_status;
    if (walk_in_status === "Cancelled") {
      walkIn.status = "inactive";
    }
    await walkIn.save({ transaction });

    // Update lead statuses based on walk-in status and is_call flag
    if (walkIn.lead) {
      const prefix = walkIn.is_call ? "Advisor Consultation" : "Appointment";
      
      let leadStatusUpdate = {
        last_updated_status: `${prefix} ${walk_in_status}`
      };

      // Map walk-in status to appropriate lead status
      switch (walk_in_status) {
        case "Completed":
          leadStatusUpdate.lead_status = `${prefix} Completed`;
          break;
        case "Cancelled":
          leadStatusUpdate.lead_status = `${prefix} Cancelled`;
          break;
        case "Rescheduled":
          leadStatusUpdate.lead_status = `${prefix} Rescheduled`;
          break;
        case "Pending":
          leadStatusUpdate.lead_status = `${prefix} Pending`;
          break;
        case "No Show":
          leadStatusUpdate.lead_status = `${prefix} No Show`;
          break;
        default:
          leadStatusUpdate.lead_status = `${prefix} ${walk_in_status}`;
      }

      await walkIn.lead.update(leadStatusUpdate, { transaction });
    }

    // Create activity log
    let logData = createLogData(
      ACTIVITY_LOGS.WALK_IN_UPDATE(walk_in_status),
      ACTIVITY_TYPES.WALK_IN_UPDATE,
      user_id,
      lead_id || walkIn.lead_id,
      null,
      lead_name || walkIn.lead?.name
    );

    await createActivityLog(logData, transaction);
    await transaction.commit();

    return ApiResponse(
      res,
      "success",
      200,
      "Walk-in status updated successfully",
      {
        walkIn,
        lead: walkIn.lead
      }
    );
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating walk-in status:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to update walk-in status!",
      null,
      error
    );
  }
}

async function rescheduleWalkIn(req, res) {
  const transaction = await sequelize.transaction(); // Start transaction
  try {
      const { walk_in_id, rescheduled_date_time, note, lead_name, is_call } = req.body;

      if (!walk_in_id || !rescheduled_date_time) {
          await transaction.rollback();
          return ApiResponse(res, "error", 400, "Missing required fields!");
      }

      const rescheduledDate = new Date(rescheduled_date_time);
      if (isNaN(rescheduledDate.getTime())) {
          await transaction.rollback();
          return ApiResponse(res, "error", 400, "Invalid date format");
      }

      const walkInFromDB = await WalkIn.findOne({
          where: { id: walk_in_id },
          transaction
      });

      if (!walkInFromDB) {
          await transaction.rollback();
          return ApiResponse(res, "error", 400, "Walk-In Not found");
      }

      const lead = await Lead.findByPk(walkInFromDB.lead_id, {transaction})
      if (!lead) {
        await transaction.rollback();
        return ApiResponse(res, "error", 400, "Lead not found!");
      }

      // Update fields
      walkInFromDB.is_rescheduled = true;
      walkInFromDB.rescheduled_date_time = rescheduledDate;
      walkInFromDB.walk_in_status = "Rescheduled";
      if (note) walkInFromDB.note = note;

      await walkInFromDB.save({ transaction });

      let updatePayload = {}
      if(is_call){
        updatePayload = {
          last_updated_status:"Re-Scheduled Call With Manager",
          lead_status: "Re-Scheduled Call With Manager"
        }
      }else{
        updatePayload = {
          last_updated_status:"Re-Scheduled For Walk-In",
          lead_status: "Re-Scheduled For Walk-In"
        }
      }
      await lead.update(updatePayload, { transaction });

      let logData = createLogData(
          is_call ? ACTIVITY_LOGS.RESCHEDULE_CALL_WITH_MANAGER(rescheduled_date_time) : ACTIVITY_LOGS.WALK_IN_RESCHEDULE(rescheduled_date_time),
          is_call ? ACTIVITY_TYPES.RESCHEDULE_CALL_WITH_MANAGER : ACTIVITY_TYPES.WALK_IN_RESCHEDULE,
          walkInFromDB.created_by,
          walkInFromDB.lead_id,
          note,
          lead_name
      );

      await createActivityLog(logData, transaction);

      await transaction.commit(); // Commit transaction before returning

      return ApiResponse(res, "success", 200, "Walk-In Rescheduled Successfully.", walkInFromDB);

  } catch (error) {
      if (transaction) await transaction.rollback(); // Rollback on error
      console.error(error);
      return ApiResponse(res, "error", 500, error?.message || "Failed to reschedule walk-in!", null, error);
  }
}

async function getWalkInsCount(req, res) {
  try {
    const { created_by } = req.query;

    // Define IST timezone
    const IST_TIMEZONE = "Asia/Kolkata";

    // Get the current IST time
    const nowIST = moment().tz(IST_TIMEZONE);

    // Get the start and end of today in IST
    const startOfTodayIST = nowIST.clone().startOf("day");
    const endOfTodayIST = nowIST.clone().endOf("day");

    // Convert IST times to UTC for querying
    const startOfTodayUTC = startOfTodayIST.utc().format("YYYY-MM-DD HH:mm:ss");
    const endOfTodayUTC = endOfTodayIST.utc().format("YYYY-MM-DD HH:mm:ss");

    // Base filter for created_by
    const whereClause = {};
    if (created_by) {
      whereClause.created_by = created_by;
    }

    // Get total walk-ins
    const totalWalkIns = await WalkIn.count({
      where: {
        status:'active',
        ...whereClause,
        [Op.or]: [
          { is_rescheduled: true, rescheduled_date_time: { [Op.ne]: null } },
          { is_rescheduled: false },
        ],
      },
    });

    // Get today's walk-ins using IST-based UTC times
    const todayWalkIns = await WalkIn.count({
      where: {
        ...whereClause,
        [Op.or]: [
          {
            is_rescheduled: true,
            rescheduled_date_time: {
              [Op.between]: [startOfTodayUTC, endOfTodayUTC],
            },
          },
          {
            is_rescheduled: false,
            walk_in_date_time: {
              [Op.between]: [startOfTodayUTC, endOfTodayUTC],
            },
          },
        ],
      },
    });

    return ApiResponse(
      res,
      "success",
      200,
      "Walk-In counts fetched successfully",
      { totalWalkIns, todayWalkIns }
    );
  } catch (error) {
    console.error("Error fetching walk-in counts:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch Walk-Ins Count!",
      null,
      error
    );
  }
}

async function getWalkInsByLeadId(req,res){
  try {
    const {lead_id} = req.query
    if(!lead_id){
      return ApiResponse(res, 'error', 400, "Lead ID is required !")
    }

    const walkIns = await WalkIn.findAll({
      where: { 
        lead_id: lead_id, 
        status: 'active', // Fetch only active walk-ins
        walk_in_date_time: {
          [Op.gte]: new Date(), // Filter for walk-ins on or after the current time
        },
      },
      order: [['walk_in_date_time', 'ASC']], // Sort by walk-in date
    });

    return ApiResponse(res, 'success', 200, "Query Successful", walkIns)
  } catch (error) {
    return ApiResponse(res, 'error', 500, error?.message || "Failed to fetch Walk-Ins for given lead id !", null, error, null)
  }
}

module.exports = {
  scheduleWalkIn,
  getWalkIns,
  updateWalkInStatus,
  rescheduleWalkIn,
  getWalkInsCount,
  getWalkInsByLeadId
};
