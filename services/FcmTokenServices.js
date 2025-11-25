const admin = require("../config/firebase")
const { FcmToken } = require("../models")

async function registerDevice(userId, fcmToken, transaction){
    const [record, created] = await FcmToken.upsert(
        { userId, fcmToken },
        { transaction, returning:true }
    )
    return record
}

async function getFcmTokenByUserId(userId, transaction=null){
    const fcmToken = await FcmToken.findOne({
        where: { userId },
        attributes: ["fcmToken"],
        raw: true, 
        ...(transaction && { transaction })
    })
    return fcmToken
}

async function initiateCall(fcmToken, customerNumber) {

  console.log(`📤 Sending DIAL command to device ${fcmToken.slice(0, 20)}...`);

  const message = {
    token: fcmToken,
    data: {
      action: "DIAL",
      phone_number: String(customerNumber),
    },
    android: { priority: "high" },
  };

  const response = await admin.messaging().send(message);
  console.log("✅ FCM DIAL sent successfully:", response);

  return response;
}

module.exports = {
    registerDevice,
    getFcmTokenByUserId,
    initiateCall
}