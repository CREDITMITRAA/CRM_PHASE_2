const { Op } = require("sequelize")
const { Notification, Activity, sequelize } = require("../models")
const moment = require("moment-timezone");
const { raw } = require("mysql2");
const { TASK_REMINDER } = require("../utilities/constants");
const { getIo } = require("../socket/socket");

async function saveNotification(notification,transaction){
    const {employee_id, message} = notification
    if(!employee_id || !message){
        throw new Error("Missing Required Fields !")
    }

    const savedNotification = Notification.create(
        {...notification},
        {transaction}
    )

    return savedNotification
}

async function sendRecentTaskNotifications(){
    const transaction = await sequelize.transaction()
    try {
        // fetch all tasks whose task date is in next 1 minute
        const nowUTC = moment.utc()
        const fiveMinutesLaterUTC = moment.utc().add(1, 'minute')

        const activities = await Activity.findAll({
            where: {
                follow_up : {
                    [Op.between] : [nowUTC.toDate(), fiveMinutesLaterUTC.toDate()]
                },
                status: 'active'
            },
            attributes: ['id', 'lead_id', 'created_by'],
            raw: true,
            transaction
        })

        if(!activities.length){
            await transaction.rollback()
            return
        }

        // fetch notifications with notification_title = "Task Reminder" within same 1 minute
        const notificationsFromDB = await Notification.findAll({
            where: {
                createdAt: {
                    [Op.between]: [moment.utc().subtract(1, "minute").toDate(), moment.utc().toDate()]
                },
                notification_title: "Task Reminder",
                status: "active"
            },
            attributes: ["id", "message"],
            raw: true
        });

        // filter the tasks to notify to employees
        const notifiedLeadIds = new Set(
                notificationsFromDB
                .map((notification) => {
                const parts = notification.message.split("-");
                return parts.length > 1 ? parseInt(parts[1], 10) : null;
                })
            .filter(Boolean)
        );

        // filter tasks not yet notified
        const tasksToNotify = activities.filter(
            (activity) => !notifiedLeadIds.has(activity.lead_id)
        );

        if(!tasksToNotify.length){
            await transaction.rollback()
            return
        }

        const io = getIo()

        // prepare notifications in bulk
        const notificationsData = tasksToNotify.map((task) => ({
            employee_id: task.created_by,
            lead_id: task.lead_id, // ✅ add column in DB schema
            message: `Upcoming task Lead ID - ${task.lead_id}`,
            notification_from: "System",
            notification_title: TASK_REMINDER,
            status: 'active'
        }));

        // save all in one go
        const savedNotifications = await Notification.bulkCreate(
            notificationsData,
            { transaction, returning: true }
        );

        // emit events
        savedNotifications.forEach((notification, index) => {
                const task = tasksToNotify[index];
                io.to(`user_${task.created_by}`).emit("leadAssignment", {
                notification_title: TASK_REMINDER,
                message: notification.message,
                notification_from: notification.notification_from,
                notificationId: notification.id
            });
        });

        await transaction.commit()
    } catch (error) {
        if (transaction) await transaction.rollback()
        throw error
    }
}

module.exports = {
    saveNotification,
    sendRecentTaskNotifications
}