const { getPresignedUrlFromFullUrl } = require("../config/awsS3PresignedUrlConfig");
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

    // Convert to plain objects and generate presigned URLs
    const processedProfileImages = await Promise.all(
      profileImageUrls.map(async (image) => {
        const imageData = image.get ? image.get({ plain: true }) : image;
        
        // Generate presigned URL for profile_image_urls
        if (imageData.profile_image_urls) {
          try {
            const presignedUrl = await getPresignedUrlFromFullUrl(imageData.profile_image_urls);
            if (presignedUrl) {
              // Replace the original URL with presigned URL
              imageData.profile_image_urls = presignedUrl;
            }
          } catch (error) {
            console.error('Error generating presigned URL for profile image:', error);
            // Keep original URL if presigned URL generation fails
          }
        }
        
        return imageData;
      })
    );

    return ApiResponse(
      res,
      "success",
      200,
      "Profile image URLs fetched successfully",
      processedProfileImages,
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
