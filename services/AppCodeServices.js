const { FcmToken } = require("../models")

async function generateCode(userId, transaction) {
    if (!transaction) {
        throw new Error("Transaction is required")
    }

    // First, check if a record exists for this user
    const existingRecord = await FcmToken.findOne({
        where: { userId },
        transaction
    })

    if (!existingRecord) {
        throw new Error('FCM token record not found for this user. Please register FCM token first.')
    }

    const appCode = Math.floor(100000 + Math.random() * 900000).toString()
    const appCodeExpiresAt = new Date(Date.now() + 1 * 60 * 1000) // 1 minute

    // Update the existing record
    await existingRecord.update({
        appCode,
        appCodeExpiresAt,
        appCodeAttempts: 0
    }, { transaction })

    console.log(`App Code for user ${userId}: ${appCode}`)

    return {
        appCode,
        expiresAt: appCodeExpiresAt
    }
}

async function verifyCode(userId, enteredAppCode, transaction){
    if(!transaction){
        throw new Error("Transaction is required !")
    }

    console.log(`🔍 [VERIFY START] User: ${userId}, Entered Code: ${enteredAppCode}`);

    // find fcm token record
    const record = await FcmToken.findOne({
        where: { userId },
        transaction,
        lock: transaction.LOCK.UPDATE
    })

    if(!record){
        console.log(`❌ [ERROR] No FCM token record found for user ${userId}`);
        throw new Error("Fcm token record not found !")
    }

    console.log(`📋 [RECORD FOUND] AppCode: ${record.appCode}, Attempts: ${record.appCodeAttempts}, Expires: ${record.appCodeExpiresAt}`);

    if(!record.appCode){
        console.log(`❌ [ERROR] No app code found for user ${userId}`);
        throw new Error("App code not found !")
    }

    if(record.appCodeExpiresAt < new Date()){
        console.log(`❌ [ERROR] App code expired for user ${userId}`);
        await record.update({
            appCode: null,
            appCodeExpiresAt: null,
            appCodeAttempts: 0
        }, { transaction })
        throw new Error("App code expired !")
    }

    if (record.appCodeAttempts >= 3) {
        console.log(`❌ [ERROR] Too many attempts (${record.appCodeAttempts}) for user ${userId}`);
        await record.update({
            appCode: null,
            appCodeExpiresAt: null,
            appCodeAttempts: 0
        }, { transaction })
        throw new Error('Too many failed attempts !')
    }

    if (record.appCode !== enteredAppCode) {
        console.log(`❌ [INVALID CODE] Expected: ${record.appCode}, Got: ${enteredAppCode}`);
        
        // Increment attempts
        const updatedAttempts = record.appCodeAttempts + 1;
        console.log(`🔄 [UPDATING ATTEMPTS] From ${record.appCodeAttempts} to ${updatedAttempts}`);
        
        await record.update({ 
            appCodeAttempts: updatedAttempts
        }, { transaction })
        
        console.log(`📥 [AFTER UPDATE] Before reload - Attempts: ${record.appCodeAttempts}`);
        
        // Reload the record to get the updated value
        await record.reload({ transaction });
        
        console.log(`📤 [AFTER RELOAD] Attempts: ${record.appCodeAttempts}`);
        
        const attemptsLeft = 3 - updatedAttempts;
        console.log(`🚫 [INVALID RESULT] ${attemptsLeft} attempts remaining`);
        
        throw new Error(`Invalid app code. ${attemptsLeft} attempts remaining.`)
    }

    console.log(`✅ [SUCCESS] Code verified for user ${userId}`);

    await record.update({
        appCode: null,
        appCodeExpiresAt: null,
        appCodeAttempts: 0
    }, { transaction })

    return {
        success: true,
        message: "App code verified successfully",
        userId
    }
}

module.exports = {
    generateCode,
    verifyCode
}