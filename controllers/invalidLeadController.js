const { InvalidLead } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

async function deleteInvalidLeads(req, res) {
  try {
    const response = await InvalidLead.destroy({
      truncate: true,
    });
    return ApiResponse(
      res,
      "success",
      200,
      "Deleted Invalid Leads Successfully !"
    );
  } catch (error) {
    return ApiResponse(
      resizeBy,
      "error",
      500,
      "Failed to delete invalid leads !",
      null,
      error,
      null
    );
  }
}

async function getAllInvalidLeads(req, res) {
  try {
    const page = parseInt(req.query.page || 1)
    const pageSize = parseInt(req.query.pageSize || 10)
    const offset = (page - 1) * pageSize
    const limit = pageSize
    const { reason } = req.query;
    const whereClause = reason ? { reason } : {};
    // Fetch total count and paginated data
    const { count, rows: invalidLeads } = await InvalidLead.findAndCountAll({
      where: whereClause, // Apply filter
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    // Calculate total pages
    const totalPages = Math.ceil(count / pageSize);

    // Prepare pagination metadata
    const pagination = {
      page,
      totalPages,
      total: count,
      pageSize,
    };

    return ApiResponse(
      res,
      "success",
      200,
      "Invalid Leads fetched successfully !",
      invalidLeads,
      null,
      pagination
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to get invalid leads !",
      null,
      error,
      null
    );
  }
}

async function deleteInvalidLeadsByLeadIds(req,res){
  try {
    const {leadIds} = req.body
    if(!leadIds || !Array.isArray(leadIds) || leadIds.length === 0){
      return ApiResponse(res, 'error', 400, "Invalid or Missing Lead Ids !")
    }
    const response = await InvalidLead.destroy({
      where:{
        id:leadIds
      }
    })

    if (response === 0) {
      return ApiResponse(res, "error", 404, "No Invalid Leads found for the given LeadIds!", null, null, null);
    }

    return ApiResponse(res, 'success', 200, `Delete ${response} Invalid Leads Successfully`)
  } catch (error) {
    return ApiResponse(res, 'error', 500, "Failed to delete invalid leads !", null, error, null)
  }
}

module.exports = {
  deleteInvalidLeads,
  getAllInvalidLeads,
  deleteInvalidLeadsByLeadIds
};
