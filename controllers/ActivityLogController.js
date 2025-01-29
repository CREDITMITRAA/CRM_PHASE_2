const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const {ActivityLog} = require('../models')

async function getActivityLogs(req,res){
    try {
        const {lead_id} = req.query
        const activity_logs = await ActivityLog.findAll({
            where:{lead_id:lead_id},
            order: [['createdAt', 'DESC']]
        })
        return ApiResponse(res, 'success', 200, "Query Successful", activity_logs)
    } catch (error) {
        return ApiResponse(res, 'error', 500,  "Failed to fetch activity logs !", null, error, null)
    }
}

module.exports = {
    getActivityLogs
}