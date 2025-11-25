const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { sequelize, Activity } = require("../models");
const { addLeadDocument } = require("../services/leadDocumentServices");
const { createLogData, createActivityLog } = require("../services/ActivityLogServices");
const { ACTIVITY_LOGS, ACTIVITY_TYPES } = require("../utilities/ActivityLogConstants");

const s3 = new AWS.S3();

// const upload = multer({ dest: "uploads/" });

async function uploadFile(req, res) {
  const transaction = await sequelize.transaction();
  const file = req.file;

  try {
    if (!file) {
      throw new Error("No file provided.");
    }

    // Extract required fields from the request
    const leadID = req.body.lead_id;
    const leadName = req.body.lead_name || "Unknown"; // Default if lead name is not provided
    // const fileTypeName = req.body.file_type || path.extname(file.originalname).slice(1); // Default to file extension
    const document_type = req.body.document_type || "misc"
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    const user_id = req.body.user_id
    
    // Generate unique key with directory structure
    const uniqueKey = `${leadID}/${leadID}_${leadName}_${document_type}_${timestamp}${extension}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME, // Ensure this is properly set in your environment
      Key: uniqueKey,
      Body: fs.createReadStream(file.path),
    };

    // Upload file to S3
    const data = await s3.upload(params).promise();

    // Delete local file only if it exists
    if (fs.existsSync(file.path)) {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`Failed to delete local file: ${file.path}`, err);
        } else {
          console.log(`Successfully deleted local file: ${file.path}`);
        }
      });
    }

    // Prepare database record
    const leadDocumentData = {
      lead_id: req.body.lead_id, // Assuming `lead_id` comes in the request body
      document_url: data.Location, // S3 file URL
      document_type: req.body.document_type || file.mimetype, // Optional field from request or file type
      document_name: file.originalname,
      status: "active", // Default status
    };

    // Save the record in the database
    const addedLeadDocument = await addLeadDocument(leadDocumentData, transaction);

    const recentActivity = await Activity.findOne({
      where: { lead_id:leadID },
      order: [["createdAt", "DESC"]],
      transaction,
    });

    if (recentActivity) {
      // Update docs_collected in the latest Activity
      await recentActivity.update({ docs_collected: true }, { transaction });
    } else {
      // Create a new Activity entry
      await Activity.create(
        {
          lead_id:leadID,
          created_by:user_id,
          lead_name:leadName,
          activity_status: 'Not Contacted',
          docs_collected: true,
          // task_status: TASK_STATUSES[0], // Set default task status
          status: 'active'
        },
        { transaction }
      );
    }

    let logData = null
    switch(document_type.toLowerCase()){
      case 'payslip':
        logData = createLogData(ACTIVITY_LOGS.PAYSLIP_UPLOAD(file.originalname), ACTIVITY_TYPES.PAYSLIP_UPLOAD,user_id,leadID, null,leadName)
        break;
      case 'creditbureau':
        logData = createLogData(ACTIVITY_LOGS.CREDIT_BUREAU_UPLOAD(file.originalname), ACTIVITY_TYPES.CREDIT_BUREAU_UPLOAD, user_id, leadID ,null,leadName)
        break;
      case 'otherdocs':
        logData = createLogData(ACTIVITY_LOGS.OTHER_DOC_UPLOAD(file.originalname), ACTIVITY_TYPES.OTHER_DOC_UPLOAD, user_id, leadID, null,leadName)
        break;
      case 'closingdocument':
        logData = createLogData(ACTIVITY_LOGS.CLOSING_DOC_UPLOAD(file.originalname), ACTIVITY_TYPES.CLOSING_DOC_UPLOAD, user_id, leadID, null,leadName)
        break;
    }

    await createActivityLog(logData,transaction)

    // Commit the transaction
    await transaction.commit();

    // Return success response
    return ApiResponse(
      res,
      "success",
      201,
      "File Uploaded successfully!",
      { fileData: data, dbData: addedLeadDocument },
      null,
      null
    );
  } catch (error) {
    // Rollback the transaction
    await transaction.rollback();

    // Ensure local file is deleted if it exists
    if (fs.existsSync(file.path)) {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`Failed to delete local file during error handling: ${file.path}`, err);
        } else {
          console.log(`Successfully deleted local file during error handling: ${file.path}`);
        }
      });
    }

    // Log detailed error for debugging
    console.error("Error during file upload:", error);

    // Return error response
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to upload file!",
      null,
      error.message,
      null
    );
  }
}

async function uploadMultipleFiles(req, res) {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return ApiResponse(res, "error", 400, "Files are required !");
    }

    const uploadResults = [];
    for (const file of files) {
      // Configure the S3 parameters for each file
      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME, // Replace with your bucket name
        Key: `${Date.now()}-${path.basename(file.originalname)}`, // Unique key
        Body: fs.createReadStream(file.path),
      };

      const data = await s3.upload(params).promise();
      uploadResults.push(data);
      // Remove the file from the temporary directory
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`Failed to delete file: ${file.path}`, err);
        } else {
          console.log(`Successfully deleted file: ${file.path}`);
        }
      });
    }

    return ApiResponse(
      res,
      "success",
      201,
      "Files uploaded successfully !",
      uploadResults,
      null,
      null
    );
  } catch (error) {
    // Ensure all files are removed even in case of an error
    for (const file of files) {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`Failed to delete file: ${file.path}`, err);
        }
      });
    }
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to Upload Files !",
      null,
      error,
      null
    );
  }
}

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  s3
};
