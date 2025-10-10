const { Op } = require("sequelize");
const { sequelize, CallLog } = require("../models");
const {
  createActivityLog,
  createLogData,
} = require("../services/ActivityLogServices");
const { getLeadByPhone } = require("../services/leadServices");
const { getUserByPhone } = require("../services/UserServices");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const moment = require("moment-timezone");
const { buildDateFilter, buildEmployeeFilter, getKPIMetrics, getAgentPerformance, getTimeAnalysis, uploadRecordingFile } = require("../services/CallLogServices");

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

    // Try finding lead & user
    let leadData = await getLeadByPhone(otherNumber, transaction);
    let userData = await getUserByPhone(myNumber, transaction);

    // Default if not found
    if (!leadData) {
      leadData = { id: 0, name: "UNKNOWN_LEAD" };
    }
    if (!userData) {
      userData = { user_id: 0, name: "UNKNOWN_USER" };
    }

    const callLogDataToBeSaved = {
      my_number: myNumber,
      other_number: otherNumber,
      employee_id: userData.user_id,
      lead_id: leadData.id,
      call_duration,
      call_type,
      call_status,
      call_timestamp: new Date(call_timestamp),
      ringing_duration,
      total_duration,
      contact_name: contact_name || "UNKNOWN",
      call_log_id,
      call_date: new Date(call_date),
    };

    const savedCallLog = await CallLog.create(callLogDataToBeSaved, {
      transaction,
    });

    let formattedTimestamp =
      moment(call_timestamp).format("DD-MM-YYYY hh:mm A");
    let activityDescription = `Call Log Added: Call done at ${formattedTimestamp}, Call Type: ${call_type}, Call Status: ${call_status}, Call Duration: ${call_duration} seconds, Ringing Duration: ${ringing_duration} seconds, Total Duration: ${total_duration} seconds`;
    let logData = createLogData(
      activityDescription,
      "CALL_LOG_ADDED",
      userData.user_id,
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
      savedCallLog.get({ plain: true })
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
      const start = moment(startDate, "YYYY-MM-DD").startOf("day").toDate();
      const end = endDate
        ? moment(endDate, "YYYY-MM-DD").endOf("day").toDate()
        : moment(startDate, "YYYY-MM-DD").endOf("day").toDate();

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
      null,
      {
        total: count,
        pageNumber: parseInt(pageNumber),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(count / parseInt(pageSize)),
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
    } = req.query;

    if (endDate && !startDate) {
      return ApiResponse(
        res,
        "ERROR",
        400,
        "startDate is required if endDate is provided"
      );
    }

    const where = {};

    if (myNumber) {
      where.my_number = myNumber.replace(/\D/g, "").slice(-10);
    }

    if (otherNumber) {
      where.other_number = otherNumber.replace(/\D/g, "").slice(-10);
    }

    if (call_type) {
      where.call_type = call_type.toUpperCase();
    }

    if (call_status) {
      where.call_status = call_status.toUpperCase();
    }

    if (lead_id) {
      where.lead_id = lead_id;
    }

    if (employee_id) {
      where.employee_id = parseInt(employee_id, 10);
    }

    if (contact_name) {
      where.contact_name = { [Op.like]: `%${contact_name}%` };
    }

    if (startDate) {
      const start = moment(startDate, "YYYY-MM-DD").startOf("day").toDate();
      const end = endDate
        ? moment(endDate, "YYYY-MM-DD").endOf("day").toDate()
        : moment(startDate, "YYYY-MM-DD").endOf("day").toDate();
      where.call_timestamp = { [Op.between]: [start, end] };
    }

    const [results] = await CallLog.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "totalCalls"],
        [sequelize.fn("SUM", sequelize.literal("call_type = 'INCOMING'")), "totalIncomingCalls"],
        [sequelize.fn("SUM", sequelize.literal("call_type = 'MISSED'")), "totalMissedCalls"],
        [sequelize.fn("SUM", sequelize.literal("call_type = 'OUTGOING'")), "totalOutgoingCalls"],
        [sequelize.fn("SUM", sequelize.literal("call_type = 'OUTGOING' AND call_status = 'ANSWERED'")), "outgoingAnswered"],
        [sequelize.fn("SUM", sequelize.literal("call_type = 'OUTGOING' AND call_status != 'ANSWERED'")), "outgoingUnanswered"],
      ],
     where,
      raw: true,
    });

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
      500,
      error?.message || "Failed to fetch overall calls summary",
      null,
      error
    );
  }
}

async function getCallAnalytics(req,res){
  const transaction = await sequelize.transaction()
  try {
    const { startDate, endDate, employee_id, time_period } = req.query

    // build date filters
    const dateFilter = buildDateFilter(startDate, endDate, time_period)

    // build employee filters
    const employeeFilter = buildEmployeeFilter(employee_id)

    const [kpiData,agentPerformance,timeAnalysis] = await Promise.all([
      getKPIMetrics(dateFilter,employeeFilter,transaction),
      getAgentPerformance(dateFilter, employeeFilter, transaction),
      getTimeAnalysis(dateFilter, employeeFilter, transaction)
    ])

    await transaction.commit()

    let responseData = {
      kpis: kpiData,
      agentPerformance, 
      timeAnalysis
    }

    return ApiResponse(res, "SUCCESS", 200, "Call analytics fetched successfully", responseData)
  } catch (error) {
    await transaction.rollback()
    console.log("failed to fetch call analytics = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to fetch call analytics !", null, error)
  }
}

async function uploadCallRecordingFile(req,res){
  const transaction = await sequelize.transaction()
  try {
    const file = req.file

    if(!file){
      await transaction.rollback()
      return ApiResponse(res, "ERROR", 400, "No file provided !")
    }

    const { customerPhone, employeePhone } = req.body

    if( !customerPhone || !employeePhone ){
      await transaction.rollback()
      return ApiResponse(res, "ERROR", 400, "Missing required fields !")
    }

    const uploadedFileUrl = await uploadRecordingFile(normalizePhone(customerPhone), normalizePhone(employeePhone), file, transaction)

    if(!uploadedFileUrl){
      return ApiResponse(res, "ERROR", 500, "Failed to fetch uploaded file url !")
    }

    return ApiResponse(res, "SUCCESS", 201, "File uploaded successfully", uploadedFileUrl)

  } catch (error) {
    await transaction.rollback()
    console.log("Failed to upload call recording file = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to upload call recording file !", null, error)
  }
}

module.exports = {
  addCallLog,
  getOverallCallsSummary,
  getCallLogs,
  getCallAnalytics,
  uploadCallRecordingFile
};
