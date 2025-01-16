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
    // Fetch total count and paginated data
    const { count, rows: invalidLeads } = await InvalidLead.findAndCountAll({
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

module.exports = {
  deleteInvalidLeads,
  getAllInvalidLeads,
};
