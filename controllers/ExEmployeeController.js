const { Op } = require("sequelize");
const { Lead, LeadAssignment, User, Activity } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

async function getExEmployeesLeads(req, res) {
    try {
      let {
        page = 1,
        pageSize = 10,
        name,
        email,
        phone,
        leadId,
        importedOn,
        lead_source,
        reason,
        sortBy = "createdAt",
        sortOrder = "DESC",
        isPaginationOff = 'false'
      } = req.query;
  
      // Default validation to prevent non-integer inputs
      page = parseInt(page);
      pageSize = parseInt(pageSize);
      if (isNaN(page) || page < 1) page = 1;
      if (isNaN(pageSize) || pageSize < 1) pageSize = 10;
  
      const whereConditions = {};
      const assignmentWhereConditions = { status: "inactive" };
  
      // Apply filters to leadWhereConditions
      if (leadId) whereConditions.id = { [Op.like]: `%${leadId}%` };
      if (phone) whereConditions.phone = { [Op.like]: `%${phone}%` };
      if (name) whereConditions.name = { [Op.like]: `%${name}%` };
      if (email) whereConditions.email = { [Op.like]: `%${email}%` };
      if (lead_source) whereConditions.lead_source = lead_source;
      if (reason) whereConditions.reason = reason;
  
      if (importedOn) {
        const [startRange, endRange] = importedOn.split(',')
        if(startRange && endRange){
          const startOfRangeUTC = moment.tz(startRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
          const endOfRangeUTC = moment.tz(endRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
          whereConditions.createdAt = {
            [Op.between]: [startOfRangeUTC, endOfRangeUTC],
          };
        }else{
          const startOfDayUTC = moment.tz(startRange, "Asia/Kolkata").startOf("day").utc().toDate();
          const endOfDayUTC = moment.tz(startRange, "Asia/Kolkata").endOf("day").utc().toDate();
          whereConditions.createdAt = {
            [Op.between]: [startOfDayUTC, endOfDayUTC],
          };
        }
      }
  
      const includeConditions = [
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          where: assignmentWhereConditions,
          required: true,
          include: [
            {
              model: User,
              as: "AssignedTo",
              attributes: ["name"],
            },
          ],
        },
        {
          model: Activity,
          as: "Activities",
          required: false,
          order: [["createdAt", "DESC"]],
          limit: 1,
        }
      ];
  
      const isPaginationEnabled = isPaginationOff === 'false'
      const { count, rows } = await Lead.findAndCountAll({
        where: whereConditions,
        include: includeConditions,
        order: [[sortBy, sortOrder]],
        limit: isPaginationEnabled ? pageSize : null,
        offset: isPaginationEnabled ? (page - 1) * pageSize : null,
        distinct: true,
      });
  
      const totalPages = isPaginationEnabled ? Math.ceil(count / pageSize) : 1;
      let pagination = isPaginationEnabled ? {
        page: page,
        totalPages: totalPages,
        total: count,
        pageSize,
      } : null;
  
      return ApiResponse(
        res,
        "SUCCESS",
        200,
        "Ex-employees leads fetched successfully",
        rows,
        null,
        pagination
      );
    } catch (error) {
      console.error("Error fetching ex-employees leads:", error);
      return ApiResponse(
        res,
        "ERROR",
        500,
        "Failed to fetch ex-employees leads!",
        null,
        error,
        null
      );
    }
  }

module.exports = {
    getExEmployeesLeads
};
