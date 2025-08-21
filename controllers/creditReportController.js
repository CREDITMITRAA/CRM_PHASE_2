const {
  CreditReport,
  Lead,
  sequelize,
  ActivityLog,
  Activity,
  LoanReport,
} = require("../models");
const { createLogData, createActivityLog } = require("../services/ActivityLogServices");
const {
  ACTIVITY_LOGS,
  ACTIVITY_TYPES,
} = require("../utilities/ActivityLogConstants");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { ALL_DISPUTES_UPDATED, ALL_CLEAR, DISPUTE_UPDATED } = require("../utilities/constants");
const {
  generateLoanOrCreditReportChangeLog,
} = require("../utilities/helper-functions");
const LeadServices = require("../services/leadServices");

async function getCreditReportsByLeadId(req, res) {
  try {
    const { leadId } = req.params;

    // Validate if leadId is provided and valid
    if (!leadId || isNaN(leadId) || parseInt(leadId) <= 0) {
      return ApiResponse(res, "error", 400, "Invalid Lead ID!");
    }

    const validLeadId = parseInt(leadId);

    // Check if the lead exists in the Lead table (only retrieve the 'id' field)
    const leadExists = await Lead.findOne({
      where: { id: validLeadId },
      attributes: ["id"], // Only retrieve the 'id' field
    });

    if (!leadExists) {
      return ApiResponse(res, "error", 400, "Lead not found!");
    }

    // Fetch credit reports for the valid leadId
    const creditReports = await CreditReport.findAll({
      where: { lead_id: validLeadId, status: "active" },
    });

    return ApiResponse(
      res,
      "success",
      200,
      "Credit reports retrieved successfully",
      creditReports
    );
  } catch (error) {
    console.error("Error fetching credit reports by lead ID:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch credit reports",
      null,
      error,
      null
    );
  }
}

async function getAllCreditReports(req, res) {
  try {
    // Fetch all credit reports from the database
    const creditReports = await CreditReport.findAll();

    return ApiResponse(
      res,
      "success",
      200,
      "All credit reports retrieved successfully",
      creditReports
    );
  } catch (error) {
    console.error("Error fetching all credit reports:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch credit reports",
      null,
      error,
      null
    );
  }
}

async function deleteCreditReportById(req, res) {
  try {
    const { leadIds, ids } = req.body;

    // Validate if both leadIds and ids are provided
    if (!Array.isArray(leadIds) || !Array.isArray(ids)) {
      return ApiResponse(res, "error", 400, "leadIds and ids must be arrays!");
    }

    // Delete credit reports based on the provided ids
    const deletedCount = await CreditReport.destroy({
      where: {
        lead_id: { [Op.in]: leadIds },
        id: { [Op.in]: ids },
      },
    });

    if (deletedCount === 0) {
      return ApiResponse(
        res,
        "error",
        404,
        "No credit reports found to delete!"
      );
    }

    return ApiResponse(
      res,
      "success",
      200,
      `${deletedCount} credit report(s) deleted successfully!`
    );
  } catch (error) {
    console.error("Error deleting credit report:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to delete credit report(s)",
      null,
      error.message,
      null
    );
  }
}

async function deleteCreditReport(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { updated_by, id, credit_report, lead_name } = req.body;
    if (!id) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Id is required!");
    }

    if (!updated_by) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Updated by ID is required!");
    }
    // Attempt to perform a soft delete by updating the status and updated_by
    const [updatedCount] = await CreditReport.update(
      { status: "deleted", updated_by: updated_by },
      { where: { id: credit_report.id }, transaction }
    );
    if (updatedCount === 0) {
      await transaction.rollback();
      // No record was updated, meaning the record does not exist
      return ApiResponse(res, "error", 404, "Credit Report Not Found!");
    }

    // Log Activity
    let logData = createLogData(
      ACTIVITY_LOGS.CREDIT_REPORT_DELETE(
        credit_report.credit_card_name,
        credit_report.total_outstanding
      ),
      ACTIVITY_TYPES.CREDIT_REPORT_DELETE,
      updated_by,
      credit_report.lead_id,
      null,
      lead_name
    );

    await ActivityLog.create({ ...logData }, { transaction });

    await transaction.commit();

    // Record was successfully updated (soft deleted)
    return ApiResponse(
      res,
      "success",
      200,
      "Credit Report Soft Deleted Successfully!",
      { id: credit_report.id }
    );
  } catch (error) {
    await transaction.rollback(); // Rollback on error
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to Delete Credit Report !",
      null,
      error,
      null
    );
  }
}

async function addCreditReport(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {
      lead_id,
      credit_card_name,
      total_outstanding,
      created_by,
      lead_name,
      lead_status,
    } = req.body;
    if (
      !lead_id ||
      !credit_card_name ||
      !total_outstanding ||
      !created_by ||
      !lead_name ||
      !lead_status
    ) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "error",
        400,
        "Missing required fields!",
        null,
        null,
        transaction
      );
    }

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

    const newCreditReport = await CreditReport.create(
      { lead_id, created_by, credit_card_name, total_outstanding },
      { transaction }
    );

    if (lead_status === ALL_DISPUTES_UPDATED) {
      await LeadServices.updateLead(
        lead_id,
        { lead_status: ALL_CLEAR, last_updated_status: ALL_CLEAR },
        transaction
      );
      let logData = createLogData(
        ACTIVITY_LOGS.LEAD_STATUS_UPDATE(lead_status, ALL_CLEAR, null),
        ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
        created_by,
        lead_id,
        null,
        lead_name
      );
      await createActivityLog(logData, transaction);
    }

    await ActivityLog.create(
      {
        created_by,
        activity_type: ACTIVITY_TYPES.CREDIT_REPORT_ADD,
        activity_desc: ACTIVITY_LOGS.CREDIT_REPORT_ADD(
          credit_card_name,
          total_outstanding
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
      "Credit Report added successfully!",
      newCreditReport,
      null,
      null
    );
  } catch (error) {
    await transaction.rollback();
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to add credit report",
      null,
      error,
      null
    );
  }
}

async function editCreditReport(req, res) {
  const transaction = await sequelize.transaction();

  try {
    let {
      id,
      lead_id,
      credit_card_name,
      total_outstanding,
      updated_by,
      lead_name,
      loan_status,
      closing_date,
      dispute_status,
      dispute_date,
      closing_document_url,
      lead_status
    } = req.body;

    // Validate required fields
    if (
      !id ||
      !lead_id ||
      !credit_card_name ||
      !total_outstanding ||
      !updated_by ||
      !lead_name ||
      !lead_status
    ) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields!");
    }

    // Fetch current record
    const creditReportFromDB = await CreditReport.findOne({
      where: { id, lead_id },
      transaction,
    });

    if (!creditReportFromDB) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Credit report not found!");
    }

    // Convert all dates to Date objects for proper comparison
    const dbClosingDate = new Date(creditReportFromDB.closing_date);
    const inputClosingDate = closing_date ? new Date(closing_date) : null;
    const dbDisputeDate = creditReportFromDB.dispute_date
      ? new Date(creditReportFromDB.dispute_date)
      : null;
    const inputDisputeDate = dispute_date ? new Date(dispute_date) : null;

    // Treat "Others" status the same as "Not Closing"
    const isLoanClosed = loan_status === "Closed";
    const isLoanNotClosed = !isLoanClosed || loan_status === "Others";

    // 1. Reset dispute fields if loan status changed to/from Closed or closing date changed
    if (
      creditReportFromDB.loan_status !== loan_status ||
      (inputClosingDate &&
        dbClosingDate.toISOString() !== inputClosingDate.toISOString())
    ) {
      dispute_date = null;
      dispute_status = null;

      // If we're resetting dispute fields, update them in the DB
      if (dispute_date === null || dispute_status === null) {
        await LoanReport.update(
          { dispute_date: null, dispute_status: null },
          { where: { id, lead_id }, transaction }
        );
      }
    }

    // 2. All dispute operations require loan to be closed (not "Others" or "Not Closing")
    if (isLoanNotClosed && (dispute_status || dispute_date)) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "ERROR",
        400,
        "Loan must be closed to modify disputes!"
      );
    }

    // 3. Dispute Raised validations (only if loan is closed)
    if (isLoanClosed && dispute_status === "Dispute Raised") {
      if (!inputDisputeDate) {
        await transaction.rollback();
        return ApiResponse(res, "ERROR", 400, "Dispute date is required!");
      }
      if (inputDisputeDate <= dbClosingDate) {
        await transaction.rollback();
        return ApiResponse(
          res,
          "ERROR",
          400,
          "Dispute date must be after closing date!"
        );
      }
    }

    // 4. Dispute Updated validations (only if loan is closed)
    else if (isLoanClosed && dispute_status === "Dispute Updated") {
      if (creditReportFromDB.dispute_status !== "Dispute Raised") {
        await transaction.rollback();
        return ApiResponse(
          res,
          "ERROR",
          400,
          "Must raise dispute before updating!"
        );
      }
      if (!inputDisputeDate) {
        await transaction.rollback();
        return ApiResponse(
          res,
          "ERROR",
          400,
          "Updated dispute date is required!"
        );
      }
      if (inputDisputeDate <= dbDisputeDate) {
        await transaction.rollback();
        return ApiResponse(
          res,
          "ERROR",
          400,
          "Updated dispute date must be after previous dispute date!"
        );
      }
    }

    // update lead status code
    let shouldUpdateLeadStatus = false
    if(
      lead_status === ALL_DISPUTES_UPDATED && ( loan_status !== 'Closed' || dispute_status !== DISPUTE_UPDATED ) && 
      creditReportFromDB.dispute_status === DISPUTE_UPDATED
    ){
      shouldUpdateLeadStatus = true
    }

    // Only update changed fields
    const updateData = {
      credit_card_name,
      total_outstanding,
      updated_by,
      loan_status,
      closing_date,
      dispute_status,
      dispute_date,
      closing_document_url,
    };

    const [updatedCount] = await CreditReport.update(updateData, {
      where: { id, lead_id },
      transaction,
    });

    if(shouldUpdateLeadStatus){
      await LeadServices.updateLead(
        lead_id,
        {lead_status: ALL_CLEAR, last_updated_status: ALL_CLEAR},
        transaction
      )
      let logData = createLogData(
        ACTIVITY_LOGS.LEAD_STATUS_UPDATE(lead_status, ALL_CLEAR, null),
        ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
        updated_by,
        lead_id,
        null,
        lead_name
      );
      await createActivityLog(logData, transaction)
    }

    // Log activity - only if something changed
    if (updatedCount > 0) {
      const changeLog = generateLoanOrCreditReportChangeLog(
        creditReportFromDB,
        updateData,
        "CREDIT"
      );

      await ActivityLog.create(
        {
          created_by: updated_by,
          activity_type: ACTIVITY_TYPES.CREDIT_REPORT_EDIT,
          activity_desc: changeLog,
          lead_id,
          lead_name,
          status: "active",
        },
        { transaction }
      );
    }

    await transaction.commit();

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      updatedCount > 0
        ? "Credit report updated successfully!"
        : "No changes made.",
      { ...req.body }
    );
  } catch (error) {
    console.error("Error in edit credit report API:", error);
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Something went wrong!",
      null,
      error
    );
  }
}

async function deleteCreditReportClosingDocument(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { id, lead_id, lead_name, deleted_by } = req.body;
    if (!id || !lead_id || !lead_name || !deleted_by) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Missing required fields");
    }

    const creditReportFromDB = await CreditReport.findOne({
      where: { id, lead_id, status: "active" },
      transaction,
    });

    if (!creditReportFromDB) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "Credit Report Not Found !");
    }

    if (!creditReportFromDB.closing_document_url) {
      await transaction.rollback();
      return ApiResponse(res, "ERROR", 400, "No closing document exists");
    }

    const documentUrl = creditReportFromDB.closing_document_url;

    const [updatedCount] = await CreditReport.update(
      {
        closing_document_url: null,
        updated_by: deleted_by,
        loan_status: "Not Closing",
        dispute_status: null,
        closing_date: null,
        dispute_date: null,
      },
      {
        where: { id, lead_id, status: "active" },
        transaction,
      }
    );

    if (updatedCount === 0) {
      await transaction.rollback();
      return ApiResponse(
        res,
        "ERROR",
        500,
        "Failed to remove closing document"
      );
    }

    // Log activity - only if something changed
    if (updatedCount > 0) {
      let oldData = creditReportFromDB.get({ plain: true });
      let updateData = {
        ...oldData,
        closing_document_url: null,
        updated_by: deleted_by,
        loan_status: "Not Closing",
        dispute_status: null,
        closing_date: null,
        dispute_date: null,
      };

      const changeLog = generateLoanOrCreditReportChangeLog(
        creditReportFromDB,
        updateData,
        "CREDIT"
      );

      await ActivityLog.create(
        {
          created_by: deleted_by,
          activity_type: ACTIVITY_TYPES.CLOSING_DOC_DELETE,
          activity_desc: changeLog,
          lead_id,
          lead_name,
          status: "active",
        },
        { transaction }
      );
    }

    // const logData = createLogData(
    //   ACTIVITY_LOGS.CLOSING_DOC_DELETE(documentUrl),
    //   ACTIVITY_TYPES.CLOSING_DOC_DELETE,
    //   deleted_by,
    //   lead_id,
    //   null,
    //   lead_name
    // )

    // await ActivityLog.create({...logData}, {transaction})
    await transaction.commit();

    return ApiResponse(
      res,
      "SUCCESS",
      200,
      "Closing document deleted successfully"
    );
  } catch (error) {
    console.log("error in deleting closing document = ", error);
    await transaction.rollback();
    return ApiResponse(
      res,
      "ERROR",
      500,
      error?.message || "Failed to delete closing document",
      null,
      error
    );
  }
}

module.exports = {
  getCreditReportsByLeadId,
  getAllCreditReports,
  deleteCreditReportById,
  deleteCreditReport,
  addCreditReport,
  editCreditReport,
  deleteCreditReportClosingDocument,
};
