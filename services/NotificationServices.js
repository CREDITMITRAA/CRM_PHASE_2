const { Notification } = require("../models")

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



module.exports = {
    saveNotification
}