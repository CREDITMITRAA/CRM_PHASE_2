const { sequelize, CallLog } = require("../models");
const {
  createActivityLog,
  createLogData,
} = require("../services/ActivityLogServices");
const { getLeadByPhone } = require("../services/leadServices");
const { getUserByPhone } = require("../services/UserServices");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const moment = require("moment-timezone");

// Helper to normalize phone to last 10 digits
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

// Helper to parse durations like "17 seconds" -> 17
function parseDuration(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/\d+/); // extract the number
  return match ? parseInt(match[0], 10) : 0;
}

async function addCallLog(req, res) {
  const transaction = await sequelize.transaction();
  try {
    let {
      myNumber,
      otherNumber,
      call_duration,
      call_type,
      call_status,
      call_timestamp,
      ringing_duration,
      total_duration,
      contact_name,
      call_log_id,
      call_date,
      call_log_duration,
    } = req.body;

    total_duration = total_duration ?? call_log_duration;

    console.log("Received data =", req.body);

    if (
      [
        myNumber,
        otherNumber,
        call_duration,
        call_type,
        call_status,
        call_timestamp,
        ringing_duration,
        total_duration,
        contact_name,
        call_log_id,
        call_date,
      ].some((v) => v === undefined || v === null)
    ) {
      return ApiResponse(res, "ERROR", 400, "All fields are required!");
    }

    // Normalize
    myNumber = normalizePhone(myNumber);
    otherNumber = normalizePhone(otherNumber);
    call_duration = parseDuration(call_duration);
    ringing_duration = parseDuration(ringing_duration);
    total_duration = parseDuration(total_duration);
    call_type = call_type.toUpperCase();
    call_status = call_status.toUpperCase();

    console.log("Normalized numbers:", myNumber, otherNumber);

    // Enhanced UTC date handling with explicit timezone conversion
    let utcCallTimestamp, utcCallDate;
    
    try {
      console.log("Original call_timestamp:", call_timestamp);
      console.log("Original call_date:", call_date);

      // Method 1: Check if it's already in ISO format with timezone
      if (moment(call_timestamp, moment.ISO_8601, true).isValid()) {
        utcCallTimestamp = moment.utc(call_timestamp);
        console.log("Parsed as ISO format");
      } else {
        // Method 2: Parse as IST and convert to UTC
        // Try common IST formats
        const istFormats = [
          "YYYY-MM-DD HH:mm:ss",
          "DD-MM-YYYY HH:mm:ss",
          "YYYY/MM/DD HH:mm:ss",
          "DD/MM/YYYY HH:mm:ss"
        ];
        
        let parsed = null;
        for (const format of istFormats) {
          parsed = moment.tz(call_timestamp, format, "Asia/Kolkata");
          if (parsed.isValid()) {
            break;
          }
        }
        
        if (parsed && parsed.isValid()) {
          utcCallTimestamp = parsed.utc();
          console.log("Parsed as IST and converted to UTC");
        } else {
          // Method 3: Last resort - assume it's UTC
          utcCallTimestamp = moment.utc(call_timestamp);
          console.log("Parsed as UTC (fallback)");
        }
      }

      // Repeat for call_date
      if (moment(call_date, moment.ISO_8601, true).isValid()) {
        utcCallDate = moment.utc(call_date);
      } else {
        const dateFormats = [
          "YYYY-MM-DD",
          "DD-MM-YYYY", 
          "YYYY/MM/DD",
          "DD/MM/YYYY"
        ];
        
        let parsedDate = null;
        for (const format of dateFormats) {
          parsedDate = moment.tz(call_date, format, "Asia/Kolkata");
          if (parsedDate.isValid()) {
            break;
          }
        }
        
        if (parsedDate && parsedDate.isValid()) {
          utcCallDate = parsedDate.utc();
        } else {
          utcCallDate = moment.utc(call_date);
        }
      }
      
      // Validate the converted dates
      if (!utcCallTimestamp.isValid()) {
        console.error("Invalid call_timestamp after conversion:", call_timestamp);
        return ApiResponse(res, "ERROR", 400, "Invalid call_timestamp format!");
      }
      
      if (!utcCallDate.isValid()) {
        console.error("Invalid call_date after conversion:", call_date);
        return ApiResponse(res, "ERROR", 400, "Invalid call_date format!");
      }

      console.log("UTC call_timestamp:", utcCallTimestamp.format());
      console.log("UTC call_date:", utcCallDate.format());
      console.log("IST equivalent:", utcCallTimestamp.tz("Asia/Kolkata").format());

    } catch (dateError) {
      console.error("Date parsing error:", dateError);
      return ApiResponse(res, "ERROR", 400, "Invalid date format provided!");
    }

    // Try finding lead & user
    let leadData = await getLeadByPhone(otherNumber, transaction);
    let userData = await getUserByPhone(myNumber, transaction);

    // Default if not found
    if (!leadData) {
      leadData = { id: 0, name: "UNKNOWN_LEAD" };
    }
    if (!userData) {
      userData = { id: 0, name: "UNKNOWN_USER" };
    }

    const callLogDataToBeSaved = {
      my_number: myNumber,
      other_number: otherNumber,
      employee_id: userData.id,
      lead_id: leadData.id,
      call_duration,
      call_type,
      call_status,
      call_timestamp: utcCallTimestamp.toDate(), // Store as UTC Date object
      call_date: utcCallDate.toDate(), // Store as UTC Date object
      ringing_duration,
      total_duration,
      contact_name: contact_name || "UNKNOWN",
      call_log_id,
    };

    console.log("Data to be saved:", {
      ...callLogDataToBeSaved,
      call_timestamp: callLogDataToBeSaved.call_timestamp.toISOString(),
      call_date: callLogDataToBeSaved.call_date.toISOString()
    });

    const savedCallLog = await CallLog.create(callLogDataToBeSaved, {
      transaction,
    });

    // Use UTC time for consistent formatting in activity log
    let formattedTimestamp = utcCallTimestamp.tz("Asia/Kolkata").format("DD-MM-YYYY hh:mm A");
    let activityDescription = `Call Log Added: Call done at ${formattedTimestamp}, Call Type: ${call_type}, Call Status: ${call_status}, Call Duration: ${call_duration} seconds, Ringing Duration: ${ringing_duration} seconds, Total Duration: ${total_duration} seconds`;
    let logData = createLogData(
      activityDescription,
      "CALL_LOG_ADDED",
      userData.id,
      leadData.id,
      null,
      leadData.name
    );

    await createActivityLog(logData, transaction);

    await transaction.commit();

    return ApiResponse(
      res,
      "SUCCESS",
      201,
      "Call log added successfully!",
      {
        ...savedCallLog.get({ plain: true }),
        call_timestamp: utcCallTimestamp.format(), // Return UTC ISO string
        call_date: utcCallDate.format() // Return UTC ISO string
      }
    );
  } catch (error) {
    await transaction.rollback();
    console.error("Failed to add call log =", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to add call log!",
      null,
      error
    );
  }
}

async function getCallLogs(req, res) {
  try {
    const {
      myNumber,
      otherNumber,
      call_type,
      call_status,
      startDate,
      endDate,
      contact_name,
      lead_id,
      employee_id,
      pageNumber = 1, // default page
      pageSize = 20, // default batch size
    } = req.query;

    const whereClause = {};

    if (myNumber)
      whereClause.my_number = myNumber.replace(/\D/g, "").slice(-10);
    if (otherNumber)
      whereClause.other_number = otherNumber.replace(/\D/g, "").slice(-10);

    if (call_type) whereClause.call_type = call_type.toUpperCase();
    if (call_status) whereClause.call_status = call_status.toUpperCase();

    if (lead_id) whereClause.lead_id = lead_id;
    if (employee_id) whereClause.employee_id = employee_id;

    if (contact_name)
      whereClause.contact_name = { [Op.like]: `%${contact_name}%` };

    if (startDate) {
      const start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
      const end = endDate
        ? moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate()
        : moment.utc(startDate, "YYYY-MM-DD").endOf("day").toDate();
      whereClause.call_timestamp = { [Op.between]: [start, end] };
    }

    // calculate offset for pagination
    const offset = (parseInt(pageNumber) - 1) * parseInt(pageSize);

    const { count, rows } = await CallLog.findAndCountAll({
      where: whereClause,
      order: [["call_timestamp", "DESC"]],
      limit: parseInt(pageSize),
      offset,
    });

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Call logs fetched successfully!",
      rows.map((log) => log.get({ plain: true })),
      {
        total: count,
        pageNumber: parseInt(pageNumber),
        pageSize: parseInt(pageSize),
      }
    );
  } catch (error) {
    console.error("Failed to fetch call logs =", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch call logs!",
      null,
      error
    );
  }
}

async function getOverallCallsSummary(req, res) {
  try {
    const { startDate, endDate } = req.query;

    if (endDate && !startDate) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "startDate is required if endDate is provided"
      );
    }

    let dateFilter = "";
    const replacements = {};

    if (startDate) {
      const start = moment.utc(startDate, "YYYY-MM-DD").startOf("day").toDate();
      const end = endDate
        ? moment.utc(endDate, "YYYY-MM-DD").endOf("day").toDate()
        : moment.utc(startDate, "YYYY-MM-DD").endOf("day").toDate();

      dateFilter = "WHERE call_timestamp BETWEEN :start AND :end";
      replacements.start = start;
      replacements.end = end;
    }

    const [results] = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS totalCalls,
        COUNT(CASE WHEN call_type = 'INCOMING' THEN 1 END) AS totalIncomingCalls,
        COUNT(CASE WHEN call_type = 'MISSED' THEN 1 END) AS totalMissedCalls,
        COUNT(CASE WHEN call_type = 'OUTGOING' THEN 1 END) AS totalOutgoingCalls,
        COUNT(CASE WHEN call_type = 'OUTGOING' AND call_status = 'ANSWERED' THEN 1 END) AS outgoingAnswered,
        COUNT(CASE WHEN call_type = 'OUTGOING' AND call_status != 'ANSWERED' THEN 1 END) AS outgoingUnanswered
      FROM CallLogs
      ${dateFilter}
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    const summary = {
      totalCalls: parseInt(results.totalCalls, 10),
      totalIncomingCalls: parseInt(results.totalIncomingCalls, 10),
      totalMissedCalls: parseInt(results.totalMissedCalls, 10),
      totalOutgoingCalls: {
        total: parseInt(results.totalOutgoingCalls, 10),
        answered: parseInt(results.outgoingAnswered, 10),
        unanswered: parseInt(results.outgoingUnanswered, 10),
      },
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Overall calls summary fetched successfully!",
      summary
    );
  } catch (error) {
    console.log("Failed to fetch overall calls summary = ", error);
    return ApiResponse(
      res,
      "ERROR",
      error?.message || "Failed to fetch overall calls summary",
      null,
      error
    );
  }
}

module.exports = {
  addCallLog,
  getOverallCallsSummary,
  getCallLogs,
};
