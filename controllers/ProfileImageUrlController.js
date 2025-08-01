const {ProfileImageUrl} = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

async function getAllProfileImageUrls(req, res) {
  try {
    const { gender } = req.query;
    console.log('request received');
    
    
    // Build the where clause dynamically
    const whereClause = { status: "active" };
    if (gender && ['male', 'female'].includes(gender.toLowerCase())) {
        whereClause.gender = gender.toLowerCase();
      }
    console.log("WHERE clause for findAll:", whereClause);


    const profileImageUrls = await ProfileImageUrl.findAll({
      where: whereClause,
      attributes: [
        "id",
        "profile_image_urls",
        "status",
        "gender",
        "createdAt",
        "updatedAt",
      ],
    });

    return ApiResponse(
      res,
      "success",
      200,
      "Profile image URLs fetched successfully",
      profileImageUrls,
      null,
      null
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch profile image URLs",
      null,
      error.message,
      null
    );
  }
}

module.exports = {
  getAllProfileImageUrls,
};
