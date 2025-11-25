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

async function checkUsersExist(userIds, transaction = null){
    // validate incoming input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0){
        throw new Error("User IDs array is required and cannot be empty")
    }

    // validate that all IDs are numbers
    const invalidIds = userIds.filter(id => isNaN(parseInt(id)) || parseInt(id) <= 0)
    if(invalidIds.length > 0){
        throw new Error(`Invalid user IDs provided: ${invalidIds.join(', ')}`)
    }

    // find all users with given user ids
    const users = await User.findAll({
        where: {
            id: userIds
        },
        attributes: ["id", "name", "status", "role_id"],
        raw: true,
        ...(transaction && {transaction})
    })

    // check if all users are available
    const foundUserIds = users.map(user => user.id)
    const missingUserIds = userIds.filter(id => !foundUserIds.includes(parseInt(id)))

    if(missingUserIds.length > 0){
        const missingUserIdsString = missingUserIds.join(', ')
        throw new Error(`Users not found with IDs: ${missingUserIdsString}`)
    }

    return users

}

module.exports = {
    getUserByPhone,
    getUserByUserId,
    checkUsersExist
}