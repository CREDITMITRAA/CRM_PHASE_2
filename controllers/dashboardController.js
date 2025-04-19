const { Sequelize } = require("sequelize");
const { sequelize } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

const getDashboardData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query; // Get start and end dates from query params
    const today = new Date().toISOString().split("T")[0]; // Today's date in UTC

    // Convert startDate and endDate to UTC (if provided)
    let start = startDate ? new Date(startDate + "T00:00:00Z") : null; // Convert to UTC
    let end = endDate ? new Date(endDate + "T23:59:59Z") : null; // Convert to UTC

    // If startDate and endDate are not provided, they will be null, and no filtering will be applied
    const metrics = {
      calls_done: await sequelize.query(
        `SELECT created_by, COUNT(*) as count 
         FROM activities 
         WHERE (:startDate IS NULL OR createdAt >= :startDate) 
           AND (:endDate IS NULL OR createdAt <= :endDate)
         GROUP BY created_by`,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: {
            startDate: start ? start.toISOString() : null,
            endDate: end ? end.toISOString() : null,
          },
        }
      ),
      connected_calls: await sequelize.query(
        `SELECT created_by, COUNT(*) as count 
         FROM activities 
         WHERE activity_status IN ('Follow Up', 'Interested', 'Not Interested', 'Call Back', 'Verification 1') 
           AND (:startDate IS NULL OR createdAt >= :startDate) 
           AND (:endDate IS NULL OR createdAt <= :endDate)
         GROUP BY created_by`,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: {
            startDate: start ? start.toISOString() : null,
            endDate: end ? end.toISOString() : null,
          },
        }
      ),
      interested_leads: await sequelize.query(
        `SELECT created_by, COUNT(*) as count 
         FROM activities 
         WHERE activity_status = 'Interested' 
           AND (:startDate IS NULL OR createdAt >= :startDate) 
           AND (:endDate IS NULL OR createdAt <= :endDate)
         GROUP BY created_by`,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: {
            startDate: start ? start.toISOString() : null,
            endDate: end ? end.toISOString() : null,
          },
        }
      ),
      walkins_scheduled: await sequelize.query(
        `SELECT created_by, COUNT(*) as count 
         FROM activities 
         WHERE activity_status = 'Walkin' 
           AND DATE(updatedAt) = :today
           AND (:startDate IS NULL OR createdAt >= :startDate)
           AND (:endDate IS NULL OR createdAt <= :endDate)
         GROUP BY created_by`,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: {
            today: today,
            startDate: start ? start.toISOString() : null,
            endDate: end ? end.toISOString() : null,
          },
        }
      ),
      walkins_today: await sequelize.query(
        `SELECT created_by, COUNT(*) as count 
         FROM activities 
         WHERE activity_status = 'Walkin' 
           AND DATE(createdAt) = :today
           AND (:startDate IS NULL OR createdAt >= :startDate) 
           AND (:endDate IS NULL OR createdAt <= :endDate)
         GROUP BY created_by`,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: {
            today: today,
            startDate: start ? start.toISOString() : null,
            endDate: end ? end.toISOString() : null,
          },
        }
      ),
    };

    res.json(metrics);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
};

async function getChartsData(req, res) {
  try {
    const { date, date_time_range, created_by } = req.query;

    const parseDateTimeRange = (range) => {
      if (!range) return null;
      const [start, end] = range.split(',');
      return { start, end };
    };

    const dateRange = parseDateTimeRange(date_time_range);
    const createdByCondition = created_by ? `AND u.id = '${created_by}'` : ''; // Changed to id
    const assignedToCondition = created_by ? `AND u.id = '${created_by}'` : ''; // Changed to id
    const userStatusCondition = `u.status = 'active'`; // New condition

    let dateFilter = '';
    let dateConditionForWalkInScheduledToday = '';
    let dateConditionForWalkInsToday = '';
    let dateConditionForApprovedForWalkIns = '';

    if (dateRange) {
      dateFilter = `AND CONVERT_TZ(createdAt, '+00:00', '+05:30') BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;

      dateConditionForWalkInScheduledToday = `
        CONVERT_TZ(createdAt, '+00:00', '+05:30') BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      `;

      dateConditionForWalkInsToday = `(
        (is_rescheduled = 1 AND rescheduled_date_time IS NOT NULL AND 
         CONVERT_TZ(rescheduled_date_time, '+00:00', '+05:30') BETWEEN '${dateRange.start}' AND '${dateRange.end}')
        OR
        ((is_rescheduled = 0 OR rescheduled_date_time IS NULL) AND 
         CONVERT_TZ(walk_in_date_time, '+00:00', '+05:30') BETWEEN '${dateRange.start}' AND '${dateRange.end}')
      )`;

      dateConditionForApprovedForWalkIns = `
        CONVERT_TZ(l.updatedAt, '+00:00', '+05:30') BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      `;
    } else if (date) {
      dateFilter = `AND DATE(CONVERT_TZ(createdAt, '+00:00', '+05:30')) = '${date}'`;

      dateConditionForWalkInScheduledToday = `
        DATE(CONVERT_TZ(createdAt, '+00:00', '+05:30')) = '${date}'
      `;

      dateConditionForWalkInsToday = `(
        (is_rescheduled = 1 AND rescheduled_date_time IS NOT NULL AND 
         DATE(CONVERT_TZ(rescheduled_date_time, '+00:00', '+05:30')) = '${date}')
        OR
        ((is_rescheduled = 0 OR rescheduled_date_time IS NULL) AND 
         DATE(CONVERT_TZ(walk_in_date_time, '+00:00', '+05:30')) = '${date}')
      )`;

      dateConditionForApprovedForWalkIns = `
        DATE(CONVERT_TZ(l.updatedAt, '+00:00', '+05:30')) = '${date}'
      `;
    } else {
      dateFilter = '';
      dateConditionForWalkInScheduledToday = '1 = 1';
      dateConditionForWalkInsToday = '1 = 1';
      dateConditionForApprovedForWalkIns = '1 = 1';
    }

    // Calls Done
    const [callsDoneData] = await sequelize.query(`
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT('created_by', u.id, 'count', COALESCE(a.activity_count, 0))
      ) AS calls_done
      FROM ${process.env.DB_NAME}.Users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS activity_count
        FROM ${process.env.DB_NAME}.Activities
        WHERE status = 'active' ${dateFilter}
        GROUP BY created_by
      ) a ON u.id = a.created_by
      WHERE ${userStatusCondition} ${createdByCondition};
    `);
    const calls_done = callsDoneData[0]?.calls_done || [];

    // Connected Calls
    const [connectedCallsData] = await sequelize.query(`
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT('created_by', u.id, 'count', COALESCE(a.activity_count, 0))
      ) AS connected_calls
      FROM ${process.env.DB_NAME}.Users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS activity_count
        FROM ${process.env.DB_NAME}.Activities
        WHERE status = 'active'
          AND activity_status NOT IN ('Not Contacted', 'RNR ( Ring No Response )', 'Switched Off', 'Busy', 'Not Working / Not Reachable')
          ${dateFilter}
        GROUP BY created_by
      ) a ON u.id = a.created_by
      WHERE ${userStatusCondition} ${createdByCondition};
    `);
    const connected_calls = connectedCallsData[0]?.connected_calls || [];

    // Interested Leads
    const [interestedCallsData] = await sequelize.query(`
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT('created_by', u.id, 'count', COALESCE(a.activity_count, 0))
      ) AS interested_calls
      FROM ${process.env.DB_NAME}.Users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS activity_count
        FROM ${process.env.DB_NAME}.Activities
        WHERE status = 'active'
          AND activity_status = 'Interested'
          ${dateFilter}
        GROUP BY created_by
      ) a ON u.id = a.created_by
      WHERE ${userStatusCondition} ${createdByCondition};
    `);
    const interested_leads = interestedCallsData[0]?.interested_calls || [];

    // Walk-ins Scheduled Today
    const [walkinsScheduledToday] = await sequelize.query(`
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT('created_by', u.id, 'count', COALESCE(wi.walkin_count, 0))
      ) AS walkins_today
      FROM ${process.env.DB_NAME}.Users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS walkin_count
        FROM ${process.env.DB_NAME}.WalkIns
        WHERE status = 'active' AND ${dateConditionForWalkInScheduledToday}
        GROUP BY created_by
      ) wi ON u.id = wi.created_by
      WHERE ${userStatusCondition} ${createdByCondition};
    `);
    const walkins_scheduled_today = walkinsScheduledToday[0]?.walkins_today || [];

    // Walk-ins Today
    const [walkinsToday] = await sequelize.query(`
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT('created_by', u.id, 'count', COALESCE(wi.walkin_count, 0))
      ) AS walkins_today
      FROM ${process.env.DB_NAME}.Users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS walkin_count
        FROM ${process.env.DB_NAME}.WalkIns
        WHERE status = 'active' AND ${dateConditionForWalkInsToday}
        GROUP BY created_by
      ) wi ON u.id = wi.created_by
      WHERE ${userStatusCondition} ${createdByCondition};
    `);
    const walkins_today = walkinsToday[0]?.walkins_today || [];

    // Approved for Walk-ins
    const [approvedForWalkIns] = await sequelize.query(`
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT('created_by', u.id, 'count', COALESCE(la.approved_count, 0))
      ) AS approved_walkins_today
      FROM ${process.env.DB_NAME}.Users u
      LEFT JOIN (
        SELECT la.assigned_to, COUNT(*) AS approved_count
        FROM ${process.env.DB_NAME}.Leads l
        INNER JOIN ${process.env.DB_NAME}.LeadAssignments la ON l.id = la.lead_id
        WHERE l.verification_status = 'Approved for Walk-In'
          AND ${dateConditionForApprovedForWalkIns}
          AND l.status = 'active'
          AND la.status = 'active'
        GROUP BY la.assigned_to
      ) la ON u.id = la.assigned_to
      WHERE ${userStatusCondition} ${assignedToCondition};
    `);
    const approved_for_walk_ins = approvedForWalkIns[0]?.approved_walkins_today || [];

    const data = {
      calls_done,
      connected_calls,
      interested_leads,
      walkins_scheduled_today,
      walkins_today,
      approved_for_walk_ins
    };

    return ApiResponse(res, "success", 200, "Query Successful!", data, null, null);

  } catch (error) {
    console.error("getChartsData error:", error);
    return ApiResponse(res, "error", 500, "Failed to fetch charts data!", null, error, null);
  }
}


module.exports = { getDashboardData, getChartsData };
