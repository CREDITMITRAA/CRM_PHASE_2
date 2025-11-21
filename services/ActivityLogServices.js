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

async function getRecentActivityLogByLeadIdAndActivityType(leadId, activityType){
    const activityLog = await ActivityLog.findOne({
        where: {
            lead_id: leadId,
            activity_type: activityType,
            status: 'active'
        },
        order: [['createdAt', 'DESC']]
    })
    return activityLog
}

module.exports = {
    createActivityLog,
    createLogData,
    getRecentActivityLogByLeadIdAndActivityType
}