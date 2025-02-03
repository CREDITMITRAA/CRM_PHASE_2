const {ActivityLog} = require("../models")

async function createActivityLog(logData,transaction){
    const createdActivityLog = await ActivityLog.create(
        {...logData},
        {transaction}
    )
    return createdActivityLog
}

function createLogData(activity_desc, activity_type, created_by, lead_id, note=null, lead_name){
    return {activity_desc,activity_type,created_by,lead_id,note,lead_name}
}

module.exports = {
    createActivityLog,
    createLogData
}