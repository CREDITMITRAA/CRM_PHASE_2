const ActivityLog = require("../models")

async function createActivityLog(logData,transaction){
    const createdActivityLog = await ActivityLog.create(
        {...logData},
        {transaction}
    )
    return createdActivityLog
}

module.exports = {
    createActivityLog
}