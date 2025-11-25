const { Notification } = require('../models')
const {ApiResponse} = require('../utilities/api-responses/ApiResponse')


async function acknowledgeNotification(req,res){
    try {
        const {notification_id} = req.params
        if(!notification_id){
            return ApiResponse(res, 'error', 400, "Notification Id is required !")
        }

        const updatedNotification = await Notification.update(
            {is_read:true},
            {where: {id:notification_id}}
        )

        if (updatedNotification[0] === 0) {
            return ApiResponse(res, 'error', 400, "Notification Not Found !")
        }

        return ApiResponse(res, 'success', 200, "Notification Acknowledged Successfully !")
    } catch (error) {
        return ApiResponse(res, 'error', 500, error?.message || "Failed to Acknowledge Notification !", null, error, null)
    }
}

async function getNotificationsByEmployeeId(req,res){
    try {
        const {employee_id, page=1, pageSize=10, only_unacknowledged=false, is_interactive=false} = req.query
        console.log('employee id = ', employee_id);
        
        if(!employee_id) {
            return ApiResponse(res, 'error', 400, "Employee Id is required !")                                      
        }

        const pageNumber = parseInt(page,10)
        const limit = parseInt(pageSize,10)
        const offset = (pageNumber-1)*limit

        let whereConditions = {employee_id}
        if(only_unacknowledged){
            whereConditions.is_read = false
        }

        if(is_interactive){
            whereConditions.is_interactive = is_interactive
        }

        const {count,rows} = await Notification.findAndCountAll({
            where: whereConditions,
            limit,
            offset,
            order: [
                ['is_read', 'ASC'],
                ['createdAt', 'DESC']
            ]
        })

        const totalPages = Math.ceil(count/limit)

        let pagination = {
            page: pageNumber,
            pageSize,
            totalPages,
            total: count
        }

        return ApiResponse(res, 'success', 200, "Notifications Fetched Successfully.", rows, null, pagination)
    } catch (error) {
        return ApiResponse(res, 'error', 500, error?.message || "Failed to Fetch Notifications for the Employee !", null, error, null)
    }
}

async function getUnSeenNotificationsCount(req,res){
    try {
        const {employee_id} = req.query
        if(!employee_id){
            return ApiResponse(res, 'error', 400, "Employee ID is required !")
        }

        const count = await Notification.count({
            where: {employee_id, is_read:false}
        })

        return ApiResponse(res, 'success', 200, "Count fetched succussfully.", {count})
    } catch (error) {
        return ApiResponse(res, 'error', 500, error?.message || "Failed to fetch unseen notifications count !", null, error, null)
    }
}

module.exports = {
    acknowledgeNotification,
    getNotificationsByEmployeeId,
    getUnSeenNotificationsCount
}