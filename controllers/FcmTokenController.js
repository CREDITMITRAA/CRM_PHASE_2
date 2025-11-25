const { sequelize, User, FcmToken } = require("../models")
const { getUserByPhone } = require("../services/UserServices")
const { ApiResponse } = require("../utilities/api-responses/ApiResponse")
const FcmTokenService = require("../services/FcmTokenServices")

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

async function registerDevice(req, res){
    const transaction = await sequelize.transaction()
    try {
        const { fcmToken, phoneNumber } = req.body

        // validation
        if(!fcmToken || !phoneNumber){
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        // get user id with phoneNumber from Users
        const user = await getUserByPhone(normalizePhone(phoneNumber), transaction) // returns user_id
        if(!user){
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "User not found !")
        }

        const savedToken = await FcmTokenService.registerDevice(user.user_id, fcmToken, transaction)
        await transaction.commit()
        return ApiResponse(res, "SUCCESS", 201, "Device registered successfully.", savedToken)

    } catch (error) {
        await transaction.rollback()
        console.log("Failed to register device = ", error);
        return ApiResponse(res, 'SUCCESS', 500, error?.message || "Failed to register device !", null, error)
    }
}

async function initiateCall(req, res){
    try {
        const { leadId, userId, customerNumber } = req.body
        if(!leadId || !userId || !customerNumber){
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        const fcmToken = await FcmTokenService.getFcmTokenByUserId(userId)
        if(!fcmToken || !fcmToken.fcmToken){
            return ApiResponse(res, "ERROR", 400, "Fcm token not found !")
        }
        console.log("initiating the call...");
        
        await FcmTokenService.initiateCall(fcmToken.fcmToken, customerNumber)
        console.log("call done");
        return ApiResponse(res, "SUCCESS", 200, "Call initiated successfully.")
    } catch (error) {
        console.log("Failed to initiate call = ", error);
        return ApiResponse(res, "ERROR", 500, error?.message || "Failed to initiate call", null, error)
    }
}

module.exports = {
    registerDevice,
    initiateCall
}