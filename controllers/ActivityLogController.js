const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { ActivityLog, sequelize, Lead, User, Role } = require("../models");
const moment = require("moment-timezone");
const { Op } = require("sequelize");
const {
  createLogData,
  createActivityLog,
} = require("../services/ActivityLogServices");
const {
  ACTIVITY_LOGS,
  ACTIVITY_TYPES,
} = require("../utilities/ActivityLogConstants");
const { ROLE_ADMIN } = require("../utilities/constants");
const { getPresignedUrlFromFullUrl } = require("../config/awsS3PresignedUrlConfig");

async function getActivityLogs(req, res) {
  try {
    let {
      lead_id,
      page = 1,
      pageSize = 20,
      created_by,
      createdAt,
      lead_name,
      from_dashboard,
      user_id
    } = req.query;
    const pageNumber = parseInt(page, 10);
    pageSize = parseInt(pageSize, 10);

    if (pageNumber < 1 || pageSize < 1) {
      return ApiResponse(res, 400, "Invalid page number or page size");
    }

    let whereConditions = {};
    if (lead_id) whereConditions.lead_id = lead_id;
    if (lead_name) whereConditions.lead_name = { [Op.like]: `%${lead_name}%` };
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

    if(user_id){
      const user = await User.findByPk(user_id, {
        include: {
          model: Role,
          as: "Role",
          attributes: ["role_name"],
          raw: true
        }
      })

      if(!user){
        return ApiResponse(res, "ERROR", 404, "User not found !")
      }

      const roleName = user.Role.get("role_name")
      
      if(roleName !== ROLE_ADMIN){
        whereConditions.activity_type = { [Op.ne]: ACTIVITY_TYPES.CALL_LOG_ADDED}
      }
    }

    let result;
    let pagination = {};

    if (from_dashboard === "true") {
      // Get all records first, ordered by createdAt DESC
      const allRecords = await ActivityLog.findAll({
        where: whereConditions,
        order: [["createdAt", "DESC"]],  // Primary sort by createdAt DESC
        raw: true,
      });

      // Group records by creator, maintaining the order
      const recordsByCreator = {};
      allRecords.forEach((record) => {
        if (!recordsByCreator[record.created_by]) {
          recordsByCreator[record.created_by] = [];
        }
        if (recordsByCreator[record.created_by].length < 3) {
          recordsByCreator[record.created_by].push(record);
        }
      });

      // Flatten the grouped records and sort again to ensure proper ordering
      const allFilteredRecords = Object.values(recordsByCreator)
        .flat()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Calculate pagination
      const totalRecords = allFilteredRecords.length;
      const totalPages = Math.ceil(totalRecords / pageSize);

      if (pageNumber > totalPages) {
        return ApiResponse(
          res,
          "success",
          200,
          "No more records available",
          [],
          null,
          {
            page: pageNumber,
            pageSize: pageSize,
            total: totalRecords,
            totalPages,
          }
        );
      }

      // Paginate the flattened records
      const startIdx = (pageNumber - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const paginatedRecords = allFilteredRecords.slice(startIdx, endIdx);

      pagination = {
        page: pageNumber,
        pageSize: pageSize,
        total: totalRecords,
        totalPages,
      };

      result = { count: totalRecords, rows: paginatedRecords };
    } else {
      // Original behavior for non-dashboard view
      const limit = pageSize;
      const offset = (pageNumber - 1) * pageSize;

      result = await ActivityLog.findAndCountAll({
        where: whereConditions,
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      let totalPages = Math.ceil(result.count / pageSize);
      pagination = {
        page: pageNumber,
        pageSize: pageSize,
        total: result.count,
        totalPages,
      };
    }

    if (result.rows.length > 0) {
      // Get all unique lead IDs
      const leadIds = [...new Set(
        result.rows
          .map(row => row.lead_id || row.get?.('lead_id')) // Handle both raw and model instances
          .filter(id => id)
      )];

      // Fetch all lead buckets at once
      const leads = await Lead.findAll({
        where: { id: leadIds },
        attributes: ['id', 'lead_bucket'],
        raw: true
      });

      // Create a mapping of lead_id to lead_bucket
      const leadBucketMap = leads.reduce((map, lead) => {
        map[lead.id] = lead.lead_bucket;
        return map;
      }, {});

      // Process each row to add lead_bucket and replace File URLs with presigned URLs
      result.rows = await Promise.all(
        result.rows.map(async (row) => {
          // Handle both raw results and model instances
          const rowData = typeof row.get === 'function' ? row.get({ plain: true }) : row;
          
          const processedRow = {
            ...rowData,
            lead_bucket: rowData.lead_id ? leadBucketMap[rowData.lead_id] : null
          };

          // Replace File URL with presigned URL for CALL_LOG_ADDED activities
          if (rowData.activity_type === "CALL_LOG_ADDED" && rowData.activity_desc) {
            const audioUrlMatch = rowData.activity_desc.match(/File:\s*(https?:\/\/[^\s,]+)/);
            if (audioUrlMatch && audioUrlMatch[1]) {
              try {
                const presignedUrl = await getPresignedUrlFromFullUrl(audioUrlMatch[1]);
                if (presignedUrl) {
                  // Replace the original URL with presigned URL in activity_desc
                  processedRow.activity_desc = rowData.activity_desc.replace(
                    audioUrlMatch[1], 
                    presignedUrl
                  );
                }
              } catch (error) {
                console.error('Error generating presigned URL for activity log:', error);
                // Keep original activity_desc if presigned URL generation fails
              }
            }
          }

          return processedRow;
        })
      );
    }

    return ApiResponse(
      res,
      "success",
      200,
      "Query Successful !",
      result.rows,
      null,
      pagination
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch activity logs !",
      null,
      error,
      null
    );
  }
}

async function addActivityLogNote(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { lead_id, lead_name, user_id, note } = req.body;
    if (!lead_id || !lead_name || !user_id || !note) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Missing required fields !");
    }

    let logData = createLogData(
      ACTIVITY_LOGS.ADD_ACTIVITY_LOG_NOTE,
      ACTIVITY_TYPES.ADD_ACTIVITY_LOG_NOTE,
      user_id,
      lead_id,
      note,
      lead_name
    );

    await createActivityLog(logData, transaction);
    await transaction.commit();
    return ApiResponse(res, "success", 201, "Note added successfully !", note);
  } catch (error) {
    await transaction.rollback();
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to add activity log note !",
      null,
      error,
      null
    );
  }
}

async function getLeadBasicDetailsChangeHistory(req, res) {
  try {
    let { lead_id } = req.query

    if (!lead_id) {
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    lead_id = Number(lead_id)

    const logs = await ActivityLog.findAll({
      where: { lead_id: lead_id, status: "active", activity_type: ACTIVITY_TYPES.LEAD_UPDATE },
      attributes: ["id", "created_by", "activity_desc", "lead_id", "createdAt"],
      order: [["createdAt", "ASC"]],
      raw: true
    });

    const historyMap = {};

    logs.forEach(log => {
      const regex = /(\w+)\s+changed from '([^']*)'\s+to\s+'([^']*)'/g;
      let match;
      while ((match = regex.exec(log.activity_desc)) !== null) {
        const fieldName = match[1];
        const fromVal = match[2];
        const toVal = match[3];

        if (!historyMap[fieldName]) {
          historyMap[fieldName] = [];
        }

        historyMap[fieldName].push({
          from: fromVal === "null" ? null : fromVal,
          to: toVal === "null" ? null : toVal,
          date_of_change: log.createdAt,
          updated_by: String(log.created_by)
        });
      }
    });

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Change history fetched successfully",
      historyMap
    );
  } catch (error) {
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch lead basic details change history !",
      null,
      error
    );
  }
}

module.exports = {
  getActivityLogs,
  addActivityLogNote,
  getLeadBasicDetailsChangeHistory
};
