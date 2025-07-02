const { sequelize, LoginDetail, Lead, ActivityLog } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const LoginDetailServices = require("../services/LoginDetailServices");
const {
  generateLoginDetailChangeLog,
} = require("../utilities/helper-functions");
const {
  ACTIVITY_TYPES,
  ACTIVITY_LOGS,
} = require("../utilities/ActivityLogConstants");
const { createLogData } = require("../services/ActivityLogServices");

async function addLoginDetails(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      bank_name,
      application_number,
      login_date,
      disbursal_date,
      dsa_name,
      login_status,
      user_id,
      lead_id,
      lead_name,
    } = req.body;
    // Validate required fields
    const requiredFields = [
      "lead_id",
      "bank_name",
      "application_number",
      "login_date",
      "disbursal_date",
      "dsa_name",
      "login_status",
      "user_id",
      "lead_name",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    const count = await Lead.count({
      where: { id: lead_id },
    });

    if (!count > 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Lead not found !");
    }

    const savedLogin = await LoginDetail.create(
      { ...req.body, updated_by: user_id, created_by: user_id },
      { transaction }
    );

    // Log Loan Report Addition in ActivityLog
    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.LOGIN_ADD,
        activity_desc: ACTIVITY_LOGS.LOGIN_ADD(
          bank_name,
          application_number,
          login_date,
          disbursal_date,
          dsa_name,
          login_status
        ),
        lead_id,
        lead_name,
        status: "active",
      },
      { transaction }
    );

    await transaction.commit();
    return ApiResponse(
      res,
      "SUCCESS",
      201,
      "Login details added successfully",
      savedLogin
    );
  } catch (error) {
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to add login details !",
      null,
      error
    );
  }
}

async function getLoginDetails(req, res) {
  try {
    let {
      lead_id,
      page = 1,
      pageSize = 10,
      status,
      bank_name,
      login_status,
    } = req.query;
    console.log('params received = ', req.query);
    
    // const limit = parseInt(req.query.limit) || 50;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    // Default validation to prevent non-integer inputs
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      pageSize = 10; // Enforce maximum page size
    }

    const whereConditions = {};
    if (lead_id) {
      whereConditions.lead_id = parseInt(lead_id);
      if (isNaN(whereConditions.lead_id)) {
        return ApiResponse(res, "ERROR", 400, "Invalid lead ID format");
      }
    }

    if (status) {
      whereConditions.status = status;
    }

    if (bank_name) {
      whereConditions.bank_name = {
        [Op.iLike]: `%${bank_name}%`, // Case-insensitive search
      };
    }

    if (login_status) {
      whereConditions.login_status = login_status;
    }

    // Get total count for pagination metadata
    const totalItems = await LoginDetail.count({ where: whereConditions });

    // Calculate pagination values
    const totalPages = Math.ceil(totalItems / pageSize);
    const offset = (page - 1) * pageSize;

    // Fetch paginated results
    const loginDetails = await LoginDetail.findAll({
      where: whereConditions,
      order: [["createdAt", "DESC"]], // Most recent first
      limit: pageSize,
      offset: offset,
      attributes: { exclude: ["deletedAt"] }, // Exclude soft-delete field
    });

    // Prepare response

    let pagination = {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Login details fetched successfully ",
      loginDetails,
      null,
      pagination
    );
  } catch (error) {
    return ApiResponse(
      res,
      "ERROR",
      500,
      error.message || "Failed to fetch login details !",
      null,
      error
    );
  }
}

async function editLoginDetails(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      id,
      lead_id,
      bank_name,
      application_number,
      login_date,
      disbursal_date,
      dsa_name,
      login_status,
      user_id,
      lead_name,
    } = req.body;
    if (
      !id ||
      !lead_id ||
      !bank_name ||
      !application_number ||
      !login_date ||
      !disbursal_date ||
      !dsa_name ||
      !login_status ||
      !user_id ||
      !lead_name
    ) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    const loginFromDB = await LoginDetail.findOne({
      where: { id, lead_id },
      transaction,
    });

    if (!loginFromDB) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Login not found !");
    }

    const [updatedCount] = await LoginDetail.update(
      {
        bank_name,
        application_number,
        login_date,
        disbursal_date,
        dsa_name,
        login_status,
        updated_by: user_id,
      },
      { where: { id, lead_id }, transaction }
    );

    const changeLog = generateLoginDetailChangeLog(loginFromDB, req.body);

    // Login Edit in ActivityLog
    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.LOGIN_EDIT,
        activity_desc: changeLog,
        lead_id,
        lead_name,
        status: "active",
      },
      { transaction }
    );

    await transaction.commit();
    return ApiResponse(
      res,
      "SUCCESS",
      201,
      updatedCount > 0 ? "Login updated successfully!" : "No changes made.",
      { ...req.body }
    );
  } catch (error) {
    await transaction.rollback();
    console.log("error in updating login details = ", error);

    return ApiResponse(
      res,
      "ERROR",
      500,
      error.message || "Failed to updated login details !",
      null,
      error
    );
  }
}

async function deleteLoginDetails(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { id, lead_id, lead_name, user_id,  bank_name, application_number, login_date,  disbursal_date, dsa_name, login_status } = req.body;
    if (!id || !lead_id || !lead_name || !user_id) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

   const [leadCount, loginCount] = await Promise.all([
    Lead.count({
        where:{id:lead_id, status:'active'},
        transaction
    }),
    LoginDetail.count({
        where: {id, lead_id,  status:'active'},
        transaction
    })
   ])

   if(leadCount === 0){
    await transaction.rollback();
    return ApiResponse(res, "ERROR", 404, "Lead not found !");
   }

   if(loginCount === 0){
    await transaction.rollback();
    return ApiResponse(res, "ERROR", 404, "Login details not found !");
   }

   const [updatedCount] = await LoginDetail.update(
    {status:'inactive', updated_by: user_id},
    {where:{id, lead_id}, transaction}
   )

   if(updatedCount === 0){
    await transaction.rollback();
    return ApiResponse(res, "ERROR", 404, "Login details not found !");
   }

   // Log activity
    let logData = createLogData(
      ACTIVITY_LOGS.LOGIN_DELETE(
        login_id=id,
        bank_name,
        application_number,
        login_date,
        disbursal_date,
        dsa_name,
        login_status
      ),
      ACTIVITY_TYPES.LOGIN_DELETE,
      updated_by=user_id,
      lead_id,
      null,
      lead_name
    );

    await ActivityLog.create({ ...logData }, { transaction });

    await transaction.commit(); // Commit only if everything succeeds

    return ApiResponse(
      res,
      "success",
      200,
      "Loan Report Soft Deleted Successfully!",
      { id }
    );

  } catch (error) {
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      error.message || "Failed to delete login !",
      null,
      error
    );
  }
}

module.exports = {
  addLoginDetails,
  getLoginDetails,
  editLoginDetails,
  deleteLoginDetails
};
