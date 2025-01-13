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
    const invaliedLeads = await InvalidLead.findAll({
      order: [["createdAt", "DESC"]],
    });
    return ApiResponse(
      res,
      "success",
      200,
      "Invalied Leads fetched successfully !",
      invaliedLeads,
      null,
      null
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
