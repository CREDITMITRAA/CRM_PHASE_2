const { Op } = require("sequelize");
const { InvalidLead, sequelize } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const moment = require("moment-timezone");

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
    // Pagination parameters
    const page = parseInt(req.query.page || 1);
    const pageSize = parseInt(req.query.pageSize || 10);
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    // Filter parameters
    const { 
      leadId, 
      phone, 
      name, 
      importedOn, 
      lead_source, 
      reason,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    // Build where conditions
    const whereConditions = {};
    
    // Exact match filters
    if (leadId) whereConditions.id = leadId;
    if (lead_source) whereConditions.lead_source = lead_source;
    if (reason) whereConditions.reason = reason;
    
    // Partial match filters
    if (name) whereConditions.name = { [Op.like]: `%${name}%` };
    if (phone) whereConditions.phone = { [Op.like]: `%${phone}%` };

    // Special handling for importedOn (createdAt) filter
    if (importedOn) {
      const [startRange, endRange] = importedOn.split(',');
      
      if (startRange && endRange) {
        // Date range provided (start and end)
        const startOfRangeUTC = moment.tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata").utc().toDate();
        const endOfRangeUTC = moment.tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata").utc().toDate();
        whereConditions.createdAt = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      } else {
        // Single date provided (whole day)
        const startOfDayUTC = moment.tz(startRange, "Asia/Kolkata").startOf("day").utc().toDate();
        const endOfDayUTC = moment.tz(startRange, "Asia/Kolkata").endOf("day").utc().toDate();
        whereConditions.createdAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    // Sorting
    const order = [[sortBy, sortOrder]];

    // Fetch data with filters
    const { count, rows: invalidLeads } = await InvalidLead.findAndCountAll({
      where: whereConditions,
      order,
      offset,
      limit,
    });

    // Pagination metadata
    const totalPages = Math.ceil(count / pageSize);
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
      "Invalid Leads fetched successfully!",
      invalidLeads,
      null,
      pagination
    );
  } catch (error) {
    console.error("Error fetching invalid leads:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to get invalid leads!",
      null,
      error.message,
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


async function getDistinctInvalidLeadReasons(req,res){
  try {
      let reasons = await InvalidLead.findAll({
        attributes: [
          [sequelize.fn('DISTINCT', sequelize.col('reason')), 'reason']
        ],
        where: { status: 'active' },  // Optional: only active invalid leads
        raw: true  // Ensures the result is returned as plain JSON
      })
      reasons = reasons.map((reason) => reason.reason)
      return ApiResponse(res, 'success', 200, "Query Successful", reasons)
  } catch (error) {
    return ApiResponse(res, 'error', 500, "Failed to get unique invalid leads reasons !", null, error, null)
  }
}

module.exports = {
  deleteInvalidLeads,
  getAllInvalidLeads,
  deleteInvalidLeadsByLeadIds,
  getDistinctInvalidLeadReasons
};
