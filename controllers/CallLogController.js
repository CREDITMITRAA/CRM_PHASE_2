const { sequelize, CallLog } = require("../models");
const { createActivityLog, createLogData } = require("../services/ActivityLogServices");
const { getLeadByPhone } = require("../services/leadServices");
const { getUserByPhone } = require("../services/UserServices");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const moment = require("moment-timezone");

// Helper to normalize phone to last 10 digits
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

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
      total_duration
    } = req.body;

    console.log("recieved data = ", req.body);

    // Check required fields
    if (!myNumber || !otherNumber || !call_duration || !call_type || !call_status || !call_timestamp || !ringing_duration || !total_duration) {
      return ApiResponse(res, "ERROR", 400, "Missing required fields!");
    }    

    // Normalize phone numbers to last 10 digits
    myNumber = normalizePhone(myNumber);
    otherNumber = normalizePhone(otherNumber);
    call_duration = parseDuration(call_duration);
    ringing_duration = parseDuration(ringing_duration);
    total_duration = parseDuration(total_duration);

    console.log("my number = ", myNumber, " other number = ", otherNumber);
    

    // Get lead and user data
    const leadData = await getLeadByPhone(otherNumber, transaction);
    const userData = await getUserByPhone(myNumber, transaction);

    if (!leadData) {
      return ApiResponse(res, "ERROR", 404, "Lead not found!");
    }
    if (!userData) {
      return ApiResponse(res, "ERROR", 404, "User not found!");
    }

    // Prepare call log data
    const callLogDataToBeSaved = {
    my_number: myNumber,
    other_number: otherNumber,
    employee_id: userData.id,
    lead_id: leadData.id,
    call_duration,
    call_type,
    call_status,
    call_timestamp,
    ringing_duration,
    total_duration
};

    // Save call log
    const savedCallLog = await CallLog.create(callLogDataToBeSaved, { transaction });

    // create activity log
    let formattedTimestamp = moment(call_timestamp).format('DD-MM-YYYY hh:mm A');
    let activityDescription = `Call Log Added : Call done at ${formattedTimestamp}, Call Type : ${call_type}, Call Status : ${call_status}, Call Duration : ${call_duration} seconds, Ringing Duration : ${ringing_duration} seconds, Total Duration : ${total_duration}`
    let logData = createLogData(activityDescription, 'CALL_LOG_ADDED', userData.id, leadData.id, null, leadData.name )

    await createActivityLog(logData, transaction)

    // Commit transaction
    await transaction.commit();

    return ApiResponse(res, "SUCCESS", 201, "Call log added successfully!", savedCallLog.get({ plain: true }));

  } catch (error) {
    await transaction.rollback();
    console.log("Failed to add call log = ", error);
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to add call log!", null, error);
  }
}

module.exports = {
  addCallLog
};
