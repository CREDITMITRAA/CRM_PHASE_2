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

async function getUserByUserId(userId, transaction=null){
    if(!userId){
        throw new Error("userId is required to fetch the user")
    }

    const user = await User.findOne({
        where: {id:userId},
        attributes: ["id", "name"],
        raw: true,
        ...(transaction && {transaction})
    })

    return user
}

module.exports = {
    getUserByPhone,
    getUserByUserId
}