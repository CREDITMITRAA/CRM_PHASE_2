const { User } = require("../models")

async function getUserByPhone(phone, transaction=null){
    if(!phone){
        throw new Error("Phone is required to fetch the user")
    }

    const user = await User.findOne({
        where: { phone },
        attributes: ["id", "name"],
        raw: true,
        ...(transaction && {transaction})
    })

    return user
}

module.exports = {
    getUserByPhone
}