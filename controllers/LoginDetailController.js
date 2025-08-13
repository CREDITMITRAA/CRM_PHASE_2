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
const {
  START_LOGIN,
  UNDER_PROCESS,
  LOGINS,
  DISBURSED_FROM_BANKS,
  APPLICATION_IS_CLOSED,
} = require("../utilities/constants");
const { Op } = require("sequelize");

async function addLoginDetails(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      bank_name,
      dsa_name,
      application_number,
      login_date,
      scheme,
      login_amount,
      login_status,
      sanction_date,
      sanction_amount,
      disbursal_date,
      disbursal_amount,
      note,
      user_id,
      lead_id,
      lead_name,
      application_status,
    } = req.body;
    // Validate required fields
    const requiredFields = [
      "lead_id",
      "bank_name",
      // "application_number",
      // "login_date",
      // "disbursal_date",
      // "dsa_name",
      // "login_status",
      "login_amount",
      "login_status",
      "user_id",
      "lead_name",
      "application_status",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    if (![START_LOGIN, UNDER_PROCESS].includes(application_status)) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Invalid Application Status");
    }

    const lead = await Lead.findOne({
      where: { id: lead_id, status: "active" },
      transaction,
    });

    if (!lead) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Lead not found !");
    }

    const savedLogin = await LoginDetail.create(
      { ...req.body, updated_by: user_id, created_by: user_id },
      { transaction }
    );

    const totalLogins = await LoginDetail.count({
      where: { lead_id, status: "active" },
      transaction,
    });

    const newLeadStatus = `Login Bank ${totalLogins}`;

    await Lead.update(
      {
        lead_status: newLeadStatus,
        application_status: UNDER_PROCESS,
        updated_by: user_id,
      },
      {
        where: { id: lead_id, status: "active" },
        transaction,
      }
    );

    // Log Loan Report Addition in ActivityLog
    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.LOGIN_ADD,
        activity_desc: ACTIVITY_LOGS.LOGIN_ADD(
          bank_name,
          dsa_name,
          application_number,
          login_date,
          scheme,
          login_amount,
          login_status,
          sanction_date,
          sanction_amount,
          disbursal_date,
          disbursal_amount,
          note
        ),
        lead_id,
        lead_name,
        status: "active",
      },
      { transaction }
    );

    // ✅ Log lead status change
    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
        activity_desc: `Lead status updated to "${newLeadStatus}"`,
        lead_id,
        lead_name,
        status: "active",
      },
      { transaction }
    );

    // ✅ Log application status change
    await ActivityLog.create(
      {
        created_by: user_id,
        activity_type: ACTIVITY_TYPES.APPLICATION_STATUS_UPDATE,
        activity_desc: `Application status updated to "${UNDER_PROCESS}"`,
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
    console.log("params received = ", req.query);

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
      error?.message || "Failed to fetch login details !",
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
      dsa_name,
      application_number,
      login_date,
      scheme,
      login_amount,
      login_status,
      sanction_date,
      sanction_amount,
      disbursal_date,
      disbursal_amount,
      note,
      user_id,
      lead_name,
      application_status,
    } = req.body;
    if (
      !id ||
      !lead_id ||
      !bank_name ||
      // !application_number ||
      // !login_date ||
      // !disbursal_date ||
      // !dsa_name ||
      !login_amount ||
      !login_status ||
      !user_id ||
      !lead_name ||
      !application_status
    ) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    if (![START_LOGIN, UNDER_PROCESS].includes(application_status)) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Invalid Application Status");
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
        dsa_name,
        application_number,
        login_date,
        scheme,
        login_amount,
        login_status,
        sanction_date,
        sanction_amount,
        disbursal_date,
        disbursal_amount,
        note,
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
      error?.message || "Failed to updated login details !",
      null,
      error
    );
  }
}

async function deleteLoginDetails(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      id,
      lead_id,
      lead_name,
      user_id,
      bank_name,
      application_number,
      login_date,
      disbursal_date,
      dsa_name,
      login_status,
    } = req.body;
    if (!id || !lead_id || !lead_name || !user_id) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields !");
    }

    const [leadCount, loginCount] = await Promise.all([
      Lead.count({
        where: { id: lead_id, status: "active" },
        transaction,
      }),
      LoginDetail.count({
        where: { id, lead_id, status: "active" },
        transaction,
      }),
    ]);

    if (leadCount === 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 404, "Lead not found !");
    }

    if (loginCount === 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 404, "Login details not found !");
    }

    const [updatedCount] = await LoginDetail.update(
      { status: "inactive", updated_by: user_id },
      { where: { id, lead_id }, transaction }
    );

    if (updatedCount === 0) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 404, "Login details not found !");
    }

    // count remaining active login records
    const remainingLogins = await LoginDetail.count({
      where: { lead_id, status: "active" },
      transaction,
    });

    let newLeadStatus = null;

    if (remainingLogins > 0) {
      newLeadStatus = `Login Bank ${remainingLogins}`;
      // update the lead status
      await Lead.update(
        {
          lead_status: newLeadStatus,
          updated_by: user_id,
        },
        {
          where: { id: lead_id },
          transaction,
        }
      );

      // Activity log: lead_status update
      await ActivityLog.create(
        {
          created_by: user_id,
          activity_type: ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
          activity_desc: `Lead status updated to "${newLeadStatus}"`,
          lead_id,
          lead_name,
          status: "active",
        },
        { transaction }
      );
    }

    // Log activity
    let logData = createLogData(
      ACTIVITY_LOGS.LOGIN_DELETE(
        (login_id = id),
        bank_name,
        application_number,
        login_date,
        disbursal_date,
        dsa_name,
        login_status
      ),
      ACTIVITY_TYPES.LOGIN_DELETE,
      (updated_by = user_id),
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

async function getLoginsOverallSummary(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Date handling
    let start = startDate ? new Date(startDate) : null;
    let end = endDate ? new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)) : null;

    if (start && !end) {
      end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
    }

    if (start && end && start > end) {
      return ApiResponse(res, "ERROR", 400, "Start date must be before end date");
    }

    // Base where clause for Lead model
    const leadWhereClause = {
      lead_bucket: LOGINS,
      status: "active"
    };

    // Add date filter if provided
    if (start && end) {
      leadWhereClause.start_login_date = {
        [Op.between]: [start.toISOString(), end.toISOString()]
      };
    }

    // Parallel count queries
    const [
      totalApplicationsUnderProcess,
      totalLogins,
      totalDisbursedAccounts
    ] = await Promise.all([
      Lead.count({
        where: {
          ...leadWhereClause,
          application_status: UNDER_PROCESS
        }
      }),
      Lead.count({
        where: {
          ...leadWhereClause,
          lead_status: { [Op.like]: "%Login%" }
        }
      }),
      Lead.count({
        where: {
          ...leadWhereClause,
          application_status: DISBURSED_FROM_BANKS
        }
      })
    ]);

    // Amounts calculation using raw SQL for reliability
    const [amountResult] = await sequelize.query(`
      SELECT 
        COALESCE(SUM(ld.sanction_amount), 0) AS totalSanctionedAmount,
        COALESCE(SUM(ld.disbursal_amount), 0) AS totalDisbursedAmount
      FROM LoginDetails ld
      INNER JOIN Leads l ON ld.lead_id = l.id
      WHERE 
        ld.status = 'active'
        AND l.lead_bucket = :LOGINS
        AND l.status = 'active'
        ${start && end ? "AND l.start_login_date BETWEEN :start AND :end" : ""}
    `, {
      replacements: {
        LOGINS,
        start: start?.toISOString(),
        end: end?.toISOString()
      },
      type: sequelize.QueryTypes.SELECT
    });

    // Prepare response
    const responseData = {
      totalApplicationsUnderProcess,
      totalLogins,
      totalSanctionedAmount: amountResult?.totalSanctionedAmount || 0,
      totalDisbursedAmount: amountResult?.totalDisbursedAmount || 0,
      totalDisbursedAccounts,
    };

    return ApiResponse(res, "SUCCESS", 200, "Query Successful", responseData);
  } catch (error) {
    console.error("Error in getLoginsOverallSummary:", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch overall summary!",
      null,
      error
    );
  }
}

async function getLeadsWithLoginsSummary(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const { startDate, endDate, application_status } = req.query;

    let start = startDate ? new Date(startDate) : null;
    let end = endDate
      ? new Date(new Date(endDate).setUTCHours(23, 59, 59, 999))
      : null;

    // If only startDate is given, set end as end of startDate day
    if (start && !end) {
      end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
    }

    // Build where clause
    const whereClause = {
      lead_bucket: LOGINS,
      status: 'active',
    };

    if (start && end) {
      whereClause.start_login_date = {
        [Op.between]: [start.toISOString(), end.toISOString()]
      };
    }

    if(application_status){
      whereClause.application_status = application_status
    } else {
      whereClause.application_status = {
        [Op.ne] : APPLICATION_IS_CLOSED
      }
    }

    const result = await Lead.findAndCountAll({
      attributes: {
        include: [
          [sequelize.literal(`
            (SELECT MAX(ld.createdAt) 
             FROM LoginDetails AS ld 
             WHERE ld.lead_id = Lead.id AND ld.status = 'active')
          `), 'latest_login_date']
        ]
      },
      include: [{
        model: LoginDetail,
        as: 'loginDetails',
        required: true,
        where: { status: 'active' },
        attributes: ['id', 'bank_name', 'dsa_name', 'application_number', 'scheme', 'login_amount', 'sanction_date', 'disbursal_date', 'note', 'login_date', 'login_status', 
                     'sanction_amount', 'disbursal_amount', 'createdAt'],
        order: [['createdAt', 'DESC']]
      }],
      where: whereClause,
      order: [
        [sequelize.literal('latest_login_date'), 'DESC']
      ],
      distinct: true,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const formattedResults = result.rows.map(lead => ({
      lead: {
        ...lead.get({ plain: true }),
        loginDetails: undefined
      },
      logins: lead.loginDetails.map(login => login.get({ plain: true })),
      latest_login_date: lead.dataValues.latest_login_date
    }));

    const pagination = {
      page,
      pageSize,
      totalPages: Math.ceil(result.count / pageSize),
      total: result.count,
    };

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Query Successful",
      formattedResults,
      null,
      pagination
    );
  } catch (error) {
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to fetch leads with logins summary!",
      null,
      error
    );
  }
}


module.exports = {
  addLoginDetails,
  getLoginDetails,
  editLoginDetails,
  deleteLoginDetails,
  getLoginsOverallSummary,
  getLeadsWithLoginsSummary,
};
