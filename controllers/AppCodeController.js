const { sequelize } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const AppCodeServices = require("../services/AppCodeServices")

async function generateCode(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { userId } = req.body;
    if (!userId) {
      await transaction.rollback()
      return ApiResponse(res, "ERROR", 400, "User ID required !");
    }

    const result = await AppCodeServices.generateCode(userId, transaction)
    await transaction.commit()

    return ApiResponse(res, "SUCCESS", 201, "App code generated successfully", result)

  } catch (error) {
    await transaction.rollback()
    console.log("Failed to generate app code = ", error)
    return ApiResponse(res, "ERROR", 500, error?.message || "Failed to generate app code !", null, error)
  }
}

module.exports = {
  generateCode,
};
