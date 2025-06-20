const {
  LoanReport,
  Lead,
  sequelize,
  ActivityLog,
  Activity,
} = require("../models");
const {
  createLogData,
  createActivityLog,
} = require("../services/ActivityLogServices");
const {
  ACTIVITY_LOGS,
  ACTIVITY_TYPES,
} = require("../utilities/ActivityLogConstants");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const {
  generateLoanOrCreditReportChangeLog,
} = require("../utilities/helper-functions");

async function getLoanReportsByLeadId(req, res) {
  try {
    const { leadId } = req.params;

    // Check if leadId is a valid integer
    if (!leadId || isNaN(leadId) || parseInt(leadId) <= 0) {
      return ApiResponse(res, "error", 400, "Invalid Lead ID!");
    }

    // Convert leadId to integer before querying
    const validLeadId = parseInt(leadId);

    // Check if the lead exists in the Lead table (only retrieve the id field)
    const leadExists = await Lead.findOne({
      where: { id: validLeadId },
      attributes: ["id"], // Only retrieve the 'id' field
    });

    if (!leadExists) {
      return ApiResponse(res, "error", 400, "Lead not found!");
    }

    // Fetch the loan reports for the valid leadId
    const loanReports = await LoanReport.findAll({
      where: { lead_id: validLeadId, status: "active" },
    });

    return ApiResponse(
      res,
      "success",
      200,
      "Loan reports retrieved successfully",
      loanReports
    );
  } catch (error) {
    console.error("Error fetching loan reports by lead ID:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch loan reports",
      null,
      error,
      null
    );
  }
}

async function getAllLoanReports(req, res) {
  try {
    const loanReports = await LoanReport.findAll();

    return ApiResponse(
      res,
      "success",
      200,
      "Loan reports retrieved successfully",
      loanReports
    );
  } catch (error) {
    console.error("Error fetching all loan reports:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch loan reports",
      null,
      error,
      null
    );
  }
}

async function updateLoanReport(req, res) {
  try {
    const {
      id,
      lead_id,
      loan_amount,
      bank_name,
      loan_type,
      emi,
      outstanding,
      status,
      updated_by,
    } = req.body;
    if (!id) {
      return ApiResponse(res, "error", 400, "LoanReport ID is required.");
    }

    const loanReport = await LoanReport.findByPk(id);
    if (!loanReport) {
      return ApiResponse(res, "error", 404, "LoanReport not found.");
    }

    const updateData = {};
    if (lead_id !== undefined) updateData.lead_id = lead_id;
    if (loan_amount !== undefined) updateData.loan_amount = loan_amount;
    if (bank_name !== undefined) updateData.bank_name = bank_name;
    if (loan_type !== undefined) updateData.loan_type = loan_type;
    if (emi !== undefined) updateData.emi = emi;
    if (outstanding !== undefined) updateData.outstanding = outstanding;
    if (status !== undefined) updateData.status = status;
    if (updated_by !== undefined) updateData.updated_by = updated_by;

    await loanReport.update(updateData);
    return ApiResponse(
      res,
      "success",
      200,
      "LoanReport updated successfully.",
      loanReport
    );
  } catch (error) {
    console.log(error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update loan report !",
      null,
      error,
      null
    );
  }
}

async function deleteLoanReport(req, res) {
  const transaction = await sequelize.transaction(); // FIX: Await transaction initialization

  try {
    const { updated_by, id, loan: loanReport, lead_name } = req.body;

    if (!id) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Id is required!");
    }

    if (!updated_by) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Updated by ID is required!");
    }

    if (!loanReport) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Loan report data is missing!");
    }

    // Soft delete loan report
    const [updatedCount] = await LoanReport.update(
      { status: "deleted", updated_by: updated_by },
      { where: { id: loanReport.id }, transaction } // FIX: Ensure transaction is passed correctly
    );

    if (updatedCount === 0) {
      await transaction.rollback();
      return ApiResponse(res, "error", 404, "Loan Report Not Found!");
    }

    // Log activity
    let logData = createLogData(
      ACTIVITY_LOGS.LOAN_REPORT_DELETE(
        loanReport.loan_type,
        loanReport.bank_name,
        loanReport.loan_amount,
        loanReport.emi,
        loanReport.emi_date,
        loanReport.outstanding
      ),
      ACTIVITY_TYPES.LOAN_REPORT_DELETE,
      updated_by,
      loanReport.lead_id,
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
      { id: loanReport.id }
    );
  } catch (error) {
    await transaction.rollback(); // Rollback on error
    console.error(error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to soft delete loan report!",
      null,
      error,
      null
    );
  }
}

async function addLoanReport(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      lead_id,
      loan_amount,
      bank_name,
      loan_type,
      emi,
      outstanding,
      created_by,
      lead_name,
      emi_date,
      loan_disbursal_date,
    } = req.body;

    if (
      !lead_id ||
      !loan_amount ||
      !bank_name ||
      !loan_type ||
      !emi ||
      !outstanding ||
      !created_by ||
      !lead_name ||
      !emi_date
    ) {
      return ApiResponse(
        res,
        "error",
        400,
        "Missing required fields!",
        null,
        null
      );
    }

    // Check for recent Activity
    const recentActivity = await Activity.findOne({
      where: { lead_id },
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
          lead_id,
          created_by,
          lead_name,
          activity_status: "Not Contacted",
          docs_collected: true,
          // task_status: TASK_STATUSES[0], // Set default task status
          status: "active",
        },
        { transaction }
      );
    }

    // Create Loan Report
    const newLoanReport = await LoanReport.create(
      {
        lead_id,
        loan_amount,
        bank_name,
        loan_type,
        emi,
        outstanding,
        created_by,
        emi_date,
        loan_disbursal_date,
      },
      { transaction }
    );

    // Log Loan Report Addition in ActivityLog
    await ActivityLog.create(
      {
        created_by,
        activity_type: ACTIVITY_TYPES.LOAN_REPORT_ADD,
        activity_desc: ACTIVITY_LOGS.LOAN_REPORT_ADD(
          loan_type,
          bank_name,
          loan_amount,
          emi,
          outstanding,
          emi_date,
          loan_disbursal_date
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
      "success",
      201,
      "Loan Report added successfully!",
      newLoanReport,
      null,
      null
    );
  } catch (error) {
    await transaction.rollback();
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to add loan report!",
      null,
      error,
      null
    );
  }
}

async function editLoanReport(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      id,
      lead_id,
      loan_amount,
      bank_name,
      loan_type,
      emi,
      outstanding,
      updated_by,
      lead_name,
      emi_date,
      loan_disbursal_date,
    } = req.body;

    if (
      !id ||
      !lead_id ||
      !loan_amount ||
      !bank_name ||
      !loan_type ||
      !emi ||
      !outstanding ||
      !updated_by ||
      !lead_name ||
      !emi_date ||
      !loan_disbursal_date
    ) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "Missing required fields!",
        null,
        null
      );
    }

    const loanReportFromDB = await LoanReport.findOne({
      where: { id, lead_id },
      transaction,
    });

    if (!loanReportFromDB) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Loan report not found !");
    }

    const [updatedCount] = await LoanReport.update(
      {
        loan_amount,
        bank_name,
        loan_type,
        emi,
        outstanding,
        updated_by,
        lead_name,
        emi_date,
        loan_disbursal_date,
      },
      { where: { id, lead_id }, transaction }
    );

    const changeLog = generateLoanOrCreditReportChangeLog(loanReportFromDB, req.body, "LOAN");

    // Log Loan Report Edit in ActivityLog
    await ActivityLog.create(
      {
        created_by: updated_by,
        activity_type: ACTIVITY_TYPES.LOAN_REPORT_EDIT,
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
      updatedCount > 0
        ? "Loan report updated successfully!"
        : "No changes made.",
      { ...req.body }
    );
  } catch (error) {
    console.log("error in edit loan report api = ", error);

    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Something went wrong !",
      null,
      error
    );
  }
}

module.exports = {
  getLoanReportsByLeadId,
  getAllLoanReports,
  updateLoanReport,
  deleteLoanReport,
  addLoanReport,
  editLoanReport,
};
