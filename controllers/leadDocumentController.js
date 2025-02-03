const { LeadDocument, Lead, sequelize } = require("../models");
const { createLogData, createActivityLog } = require("../services/ActivityLogServices");
const { ACTIVITY_LOGS, ACTIVITY_TYPES } = require("../utilities/ActivityLogConstants");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

async function addLeadDocuments(req, res) {
  try {
    const { lead_id, documents } = req.body;
    if (!lead_id || !Array.isArray(documents) || documents.length === 0) {
      return ApiResponse(
        res,
        "error",
        400,
        "Invalid input: lead_id and documents are required."
      );
    }

    const createdDocuments = await LeadDocument.bulkCreate(
      documents.map((doc) => ({
        lead_id,
        document_url: doc.document_url,
        document_type: doc.document_type,
        document_name: doc.document_name,
        status: doc.status || "active",
      }))
    );

    return ApiResponse(
      res,
      "success",
      201,
      "Documents Added Successfully !",
      createdDocuments
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to Add Lead Documents !",
      null,
      error,
      null
    );
  }
}

async function getLeadDocumentsByLeadId(req, res) {
  try {
    const { lead_id } = req.query;
    if (!lead_id || isNaN(lead_id) || parseInt(lead_id) <= 0) {
      return ApiResponse(res, "error", 400, "Invalid Lead ID!");
    }

    const validLeadId = parseInt(lead_id);
    // Check if the lead exists in the Lead table (only retrieve the id field)
    const leadExists = await Lead.findOne({
      where: { id: validLeadId,  status:'active' },
      attributes: ["id"], // Only retrieve the 'id' field
    });

    if (!leadExists) {
      return ApiResponse(res, "error", 400, "Lead not found!");
    }

    const leadDocuments = await LeadDocument.findAll({
        where:{lead_id: validLeadId, status:'active'}
    })

    return ApiResponse(res, 'success', 200, "Lead Documents Fetch Successfully.", leadDocuments, null,null)
  } catch (error) {
    return ApiResponse(res,"error",500,"Failed to fetch Lead Documents !",null,error,null);
  }
}

async function deleteLeadDocument(req,res){
  const transaction = await sequelize.transaction()
  try {
    const {lead_document_id, updated_by, file, userId, lead_name} = req.body

    if (!lead_document_id) {
      await transaction.rollback()
      return ApiResponse(res, 'error', 400, "Id is required!");
    }

    // if (!updated_by) {
    //   return ApiResponse(res, 'error', 400, "Updated by ID is required!");
    // }

    const [updatedCount] = await LeadDocument.update(
      { status: 'deleted', updated_by: updated_by },
      { where: { id:lead_document_id }, transaction }
    );

    if (updatedCount === 0) {
      transaction.rollback()
      // No record was updated, meaning the record does not exist
      return ApiResponse(res, 'error', 404, "Lead Document Not Found!");
    }

    let logData = null
    switch(file.document_type){
      case 'payslip':
        logData = createLogData(ACTIVITY_LOGS.PAYSLIP_DELETE(file.document_name), ACTIVITY_TYPES.PAYSLIP_DELETE,userId,file.lead_id,null,lead_name)
        break;
      case 'creditBureau':
        logData = createLogData(ACTIVITY_LOGS.CREDIT_BUREAU_DELETE(file.document_name), ACTIVITY_TYPES.CREDIT_BUREAU_DELETE, userId, file.lead_id, null, lead_name)
        break;
      case 'otherDocs':
        logData = createLogData(ACTIVITY_LOGS.OTHER_DOC_DELETE(file.document_name), ACTIVITY_TYPES.OTHER_DOC_DELETE, userId, file.lead_id, null, lead_name)
        break;
    }

    await createActivityLog(logData, transaction)
    // Record was successfully updated (soft deleted)
    await transaction.commit()
    return ApiResponse(res, 'success', 200, "Lead Document Soft Deleted Successfully!");
  } catch (error) {
    await transaction.rollback()
    return ApiResponse(res, 'error', 500, "Failed to delete lead document !", null, error, null)
  }
}

module.exports = {
  addLeadDocuments,
  getLeadDocumentsByLeadId,
  deleteLeadDocument
};
