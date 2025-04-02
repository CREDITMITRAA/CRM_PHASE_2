const { CreditReport, Lead, sequelize, ActivityLog } = require("../models");
const { createLogData } = require("../services/ActivityLogServices");
const { ACTIVITY_LOGS, ACTIVITY_TYPES } = require("../utilities/ActivityLogConstants");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

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
      where: { lead_id: validLeadId, status:'active' },
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
      "Failed to fetch credit reports",
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
      "Failed to fetch credit reports",
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

async function deleteCreditReport(req,res){
  const transaction = await sequelize.transaction();
  try {
    const {updated_by, id, credit_report, lead_name} = req.body
    if (!id) {
      await transaction.rollback();
      return ApiResponse(res, 'error', 400, "Id is required!");
    }

    if (!updated_by) {
      await transaction.rollback();
      return ApiResponse(res, 'error', 400, "Updated by ID is required!");
    }
    // Attempt to perform a soft delete by updating the status and updated_by
    const [updatedCount] = await CreditReport.update(
      { status: 'deleted', updated_by: updated_by },
      { where: { id : credit_report.id }, transaction }
    );
    if (updatedCount === 0) {
      await transaction.rollback();
      // No record was updated, meaning the record does not exist
      return ApiResponse(res, 'error', 404, "Loan Report Not Found!");
    }

    // Log Activity
    let logData = createLogData(
      ACTIVITY_LOGS.CREDIT_REPORT_DELETE(credit_report.credit_card_name, credit_report.total_outstanding),
      ACTIVITY_TYPES.CREDIT_REPORT_DELETE,
      updated_by,
      credit_report.lead_id,
      null,
      lead_name
    )

    await ActivityLog.create(
      {...logData},
      { transaction }
    )

    await transaction.commit();

    // Record was successfully updated (soft deleted)
    return ApiResponse(res, 'success', 200, "Credit Report Soft Deleted Successfully!", {id:credit_report.id});
  } catch (error) {
    await transaction.rollback(); // Rollback on error
    return ApiResponse(res,'error', 500, "Failed to Delete Credit Report !", null, error, null)
  }
}

async function addCreditReport(req,res){
  const transaction = await sequelize.transaction();
  try {
    const {lead_id,credit_card_name,total_outstanding,created_by,lead_name} = req.body
    if (!lead_id || !credit_card_name || !total_outstanding || !created_by || !lead_name) {
      return ApiResponse(res, 'error', 400, "Missing required fields!", null, null, transaction);
    }

    const newCreditReport = await CreditReport.create(
      {lead_id,created_by,credit_card_name,total_outstanding},
      {transaction}
    )

    await ActivityLog.create(
      {
        created_by,
        activity_type: ACTIVITY_TYPES.CREDIT_REPORT_ADD,
        activity_desc: ACTIVITY_LOGS.CREDIT_REPORT_ADD(credit_card_name,total_outstanding),
        lead_id,
        lead_name,
        status: 'active'
      },
      { transaction }
    );

    await transaction.commit()
    return ApiResponse(res, 'success', 201, "Credit Report added successfully!", newCreditReport, null, null);
  } catch (error) {
    return ApiResponse(res, 'error', 500, "Failed to add credit report", null, error, null)
  }
}

module.exports = {
  getCreditReportsByLeadId,
  getAllCreditReports,
  deleteCreditReportById,
  deleteCreditReport,
  addCreditReport
};
