const { User, PhoneNumber } = require("../models")

async function getUserByPhone(phone, transaction=null){
    if(!phone){
        throw new Error("Phone is required to fetch the user")
    }

    const phoneRecord = await PhoneNumber.findOne({
        where: { phone },
        attributes: ["user_id"],
        raw: true,
        ...(transaction && { transaction })
    })

    return phoneRecord
}

module.exports = {
    getUserByPhone
}