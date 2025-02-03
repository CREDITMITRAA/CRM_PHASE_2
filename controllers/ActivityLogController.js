const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const {ActivityLog} = require('../models')
const moment = require("moment-timezone");
const { Op } = require("sequelize");

async function getActivityLogs(req,res){
    try {
        let {lead_id, page = 1, pageSize = 10, created_by, createdAt} = req.query
        const pageNumber = parseInt(page, 10)
        pageSize = parseInt(pageSize, 10)

        if(pageNumber < 1 || pageSize < 1){
            return ApiResponse(res, 400, 'Invalid page number or page size')
        }
        
        const limit = pageSize
        const offset = (pageNumber - 1) * pageSize

        let whereConditions = {}
        if(lead_id) whereConditions.lead_id = lead_id
        if(created_by) whereConditions.created_by = created_by
        if(createdAt){
            const [startRange, endRange] = createdAt.split(',')
                  if(startRange && endRange){
                    const startOfRangeUTC = moment.tz(startRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
                    const endOfRangeUTC = moment.tz(endRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
                    whereConditions.createdAt = {
                      [Op.between]: [startOfRangeUTC, endOfRangeUTC],
                    };
                  }else{
                    const startOfDayUTC = moment.tz(startRange, "Asia/Kolkata").startOf("day").utc().toDate();
                    const endOfDayUTC = moment.tz(startRange, "Asia/Kolkata").endOf("day").utc().toDate();
                    whereConditions.createdAt = {
                      [Op.between]: [startOfDayUTC, endOfDayUTC],
                    };
                  }
        }

        const {count,rows} = await ActivityLog.findAndCountAll({
            where:whereConditions,
            order: [['createdAt', 'DESC']],
            limit,
            offset
        })

        let totalPages = Math.ceil(count / pageSize)
        let pagination = {
            page:page,
            pageSize:pageSize,
            totalItems:count,
            totalPages
        }
        return ApiResponse(res, 'success', 200, "Query Successful !", rows, null, pagination)
    } catch (error) {
        return ApiResponse(res, 'error', 500,  "Failed to fetch activity logs !", null, error, null)
    }
}

module.exports = {
    getActivityLogs
}