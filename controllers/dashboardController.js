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
    const { date } = req.query;
    const dateFilter = date
      ? `AND DATE(CONVERT_TZ(createdAt, '+00:00', '+05:30')) = '${date}'`
      : "";

      const dateConditionForWalkInScheduledToday = date
      ? `
      CONVERT_TZ(createdAt, '+00:00', '+05:30') >= '${date}' 
      AND CONVERT_TZ(createdAt, '+00:00', '+05:30') < DATE_ADD('${date}', INTERVAL 1 DAY)
      `
      : `1 = 1`; // No date filter (fetch all records)

  const dateConditionForWalkInsToday = date
  ? `(
    (is_rescheduled = 1 AND rescheduled_date_time IS NOT NULL AND 
    DATE(CONVERT_TZ(rescheduled_date_time, '+00:00', '+05:30')) = '${date}')
    OR
    (is_rescheduled = 0 OR rescheduled_date_time IS NULL) AND 
    DATE(CONVERT_TZ(walk_in_date_time, '+00:00', '+05:30')) = '${date}'
  )`
  : `1 = 1`;  // No date filter, get all records

  const dateConditionForApprovedForWalkIns = date
  ? `DATE(CONVERT_TZ(updatedAt, '+00:00', '+05:30')) = '${date}'`
  : `1 = 1`; // No date filter (fetch all records)

    // NO OF CALLS DONE
    const [callsDoneData] = await sequelize.query(
      `
      SELECT 
          JSON_ARRAYAGG(
              JSON_OBJECT('created_by', created_by, 'count', activity_count)
          ) AS calls_done
      FROM (
          SELECT 
              created_by, 
              COUNT(*) AS activity_count
          FROM 
              ${process.env.DB_NAME}.Activities
          WHERE 
              status = 'active'
              ${dateFilter} -- Add date filter dynamically
          GROUP BY 
              created_by
      ) AS aggregated_data;
      `
    );
    const calls_done = callsDoneData[0]?.calls_done || [];

    // NO OF CONNECTED CALLS
    const [connectedCallsData] = await sequelize.query(
      `
      SELECT 
          JSON_ARRAYAGG(
              JSON_OBJECT('created_by', created_by, 'count', activity_count)
          ) AS connected_calls
      FROM (
          SELECT 
              created_by, 
              COUNT(*) AS activity_count
          FROM 
              ${process.env.DB_NAME}.Activities
          WHERE 
              status = 'active'
              AND activity_status NOT IN ('Not Contacted', 'RNR ( Ring No Response )', 'Switched Off', 'Busy', 'Not Working / Not Reachable')
              ${dateFilter} -- Add date filter dynamically
          GROUP BY 
              created_by
      ) AS aggregated_data;
      `
    );
    const connected_calls = connectedCallsData[0]?.connected_calls || [];

    // NO OF INTERESTED LEADS
    const [interestedCallsData] = await sequelize.query(
      `
      SELECT 
          JSON_ARRAYAGG(
              JSON_OBJECT('created_by', created_by, 'count', activity_count)
          ) AS interested_calls
      FROM (
          SELECT 
              created_by, 
              COUNT(*) AS activity_count
          FROM 
              ${process.env.DB_NAME}.Activities
          WHERE 
              status = 'active'
              AND activity_status = 'Interested'
              ${dateFilter} -- Add date filter dynamically
          GROUP BY 
              created_by
      ) AS aggregated_data;
      `
    );
    const interested_leads = interestedCallsData[0]?.interested_calls || [];

    // NO OF WALK INS TODAY
    const [walkinsScheduledToday] = await sequelize.query(`
      SELECT 
          JSON_ARRAYAGG(
              JSON_OBJECT('created_by', users.created_by, 'count', COALESCE(walkin_count, 0))
          ) AS walkins_today
      FROM (
          SELECT DISTINCT created_by FROM crm.WalkIns
      ) AS users
      LEFT JOIN (
          SELECT 
              created_by, 
              COUNT(*) AS walkin_count
          FROM 
              ${process.env.DB_NAME}.WalkIns
          WHERE 
              status = 'active'
              AND ${dateConditionForWalkInScheduledToday} -- Dynamically apply date filter
          GROUP BY 
              created_by
      ) AS aggregated_data ON users.created_by = aggregated_data.created_by;
    `);

    const walkins_scheduled_today =
      walkinsScheduledToday[0]?.walkins_today || [];

    // NO OF WALKINS TODAY
    const [walkinsToday] = await sequelize.query(`
      SELECT 
          JSON_ARRAYAGG(
              JSON_OBJECT('created_by', walkins.created_by, 'count', COALESCE(walkin_count, 0))
          ) AS walkins_today
      FROM 
          (SELECT DISTINCT created_by FROM crm.WalkIns) AS walkins
      LEFT JOIN (
          SELECT 
              created_by, 
              COUNT(*) AS walkin_count
          FROM 
              ${process.env.DB_NAME}.WalkIns
          WHERE 
              status = 'active' 
              AND ${dateConditionForWalkInsToday} -- Apply correct condition
          GROUP BY 
              created_by
      ) AS aggregated_data 
      ON walkins.created_by = aggregated_data.created_by;
    `);

    const walkins_today = walkinsToday[0]?.walkins_today || [];

    // APPROVED FOR WALK-IN COUNTS
    const [approvedForWalkIns] = await sequelize.query(`
      SELECT 
    JSON_ARRAYAGG(
        JSON_OBJECT('created_by', leads.updated_by, 'count', COALESCE(approved_count, 0))
    ) AS approved_walkins_today
FROM (
    SELECT DISTINCT updated_by FROM ${process.env.DB_NAME}.Leads
) AS leads
LEFT JOIN (
    SELECT 
        updated_by, 
        COUNT(*) AS approved_count
    FROM 
        ${process.env.DB_NAME}.Leads
    WHERE 
        verification_status = 'Approved for Walk-In'
        AND ${dateConditionForApprovedForWalkIns}  -- Correct date condition
        AND status = 'active'
    GROUP BY 
        updated_by
) AS aggregated_data 
ON leads.updated_by = aggregated_data.updated_by;

    `);
    
    const approved_for_walk_ins = approvedForWalkIns[0]?.approved_walkins_today || []

    let data = {
      calls_done,
      connected_calls,
      interested_leads,
      walkins_scheduled_today,
      walkins_today,
      approved_for_walk_ins
    };
    return ApiResponse(
      res,
      "success",
      200,
      "Query Successful !",
      data,
      null,
      null
    );
  } catch (error) {
    console.log(error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch charts data !",
      null,
      error,
      null
    );
  }
}

module.exports = { getDashboardData, getChartsData };
