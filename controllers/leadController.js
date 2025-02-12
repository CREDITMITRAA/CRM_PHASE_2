const { Op, where, Sequelize } = require("sequelize");
const moment = require("moment-timezone");
const {
  sequelize,
  Lead,
  InvalidLead,
  User,
  LeadAssignment,
  Activity,
  ActivityLog,
  WalkIn
} = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const LeadServices = require("../services/leadServices");
const ActivityServices = require("../services/activityServices");
const LoanReportServices = require("../services/loanReportsServices");
const CreditReportServices = require("../services/creditReportsServices");
const {
  ROLE_ADMIN,
  ROLE_MANAGER,
  VERIFICATION_STATUSES,
  ROLE_EMPLOYEE,
  LEAD_STATUSES,
} = require("../utilities/constants");
const { getErrorReason, getUpdatedFields, getActivityType, formatString } = require("../utilities/helper-functions");
const { ACTIVITY_TYPES, ACTIVITY_LOGS } = require("../utilities/ActivityLogConstants");
const { createLogData, createActivityLog } = require("../services/ActivityLogServices");

async function createBulkLeads(req, res) {
  console.log(req.body, "Received leads data");

  // Validation flags
  const validatePhone = true;
  const validateEmail = false;
  const validateName = false;
  const validateSource = false;

  try {
    // Validate input
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return ApiResponse(
        res,
        "error",
        400,
        "Invalid input. Please provide an array of leads."
      );
    }

    let validLeads = [];
    let invalidLeads = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // const phoneRegex = /^(\+?\d{1,3}[-.\s]?)?(\d{10})$/;
    const phoneRegex = /^(\+?91|[01])?\d{10}$/;

    // Validate leads
    req.body.forEach((lead) => {
      let isValid = true;
      let reason = "";

      lead.phone = lead.phone ? String(lead.phone).replace(/\s+/g, "").trim() : null;
      if (validateName && !lead.name) {
        isValid = false;
        reason = "Missing name";
      } else if (validateEmail && (!lead.email || !emailRegex.test(lead.email))) {
        isValid = false;
        reason = "Invalid email";
      } else if (validatePhone && (!lead.phone || !phoneRegex.test(lead.phone))) {
        isValid = false;
        reason = "Invalid phone";
      } else if (validateSource && !lead.lead_source) {
        isValid = false;
        reason = "Missing lead source";
      }

      if (isValid) {
        validLeads.push(lead);
      } else {
        invalidLeads.push({ ...lead, reason });
      }
    });

    // Insert valid leads
    let createdLeads = [];
    if (validLeads.length > 0) {
      try {
        createdLeads = await Lead.bulkCreate(validLeads, {
          validate: true,
        });
      } catch (bulkError) {
        console.error("Error inserting valid leads in bulk. Trying individually:", bulkError);
        for (const lead of validLeads) {
          try {
            const createdLead = await Lead.create(lead);
            createdLeads.push(createdLead);
          } catch (singleError) {
            console.error("Error inserting valid lead:", singleError);
            const reason = getErrorReason(singleError);
            invalidLeads.push({
              ...lead,
              reason: reason,
            });
          }
        }
      }
    }

    // Insert invalid leads
    let invalidLeadResults = [];
    if (invalidLeads.length > 0) {
      try {
        invalidLeadResults = await InvalidLead.bulkCreate(invalidLeads, {
          validate: false, // Skipping validation for invalid records
        });
      } catch (error) {
        console.error("Error inserting invalid leads:", error);
      }
    }

    // Respond with results
    return ApiResponse(res, "success", 201, "Leads processed successfully", {
      totalValidLeads: createdLeads.length,
      totalInvalidLeads: invalidLeads.length,
      createdLeads: createdLeads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        lead_source: lead.lead_source,
      })),
      invalidLeads,
    });
  } catch (error) {
    console.error("Unexpected error processing leads:", error);
    return ApiResponse(res, "error", 500, "Failed to process leads", {
      error: error.message,
    });
  }
}



async function getAllLeadsWithPagination(req, res) {
  try {
    let {
      page = 1,
      pageSize = 10,
      name,
      email,
      phone,
      leadId,
      activity_status,
      employeeName,
      importedOn,
      verification_status,
      assigned_to,
      lead_status,
      assigned_to_name,
      application_status,
      lead_source,
      isPaginationOff='false',
      last_updated,
      assigned_on,
      for_walk_ins_page=false,
      walk_in_attributes=[]
    } = req.query;

    // const limit = parseInt(req.query.limit) || 50;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    // Default validation to prevent non-integer inputs
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const whereConditions = {};
    let leadAssignmentConditions = {};
    if (name) whereConditions.name = { [Op.like]: `%${name}%` };
    if (email) whereConditions.email = { [Op.like]: `%${email}%` };
    if (phone) whereConditions.phone = { [Op.like]: `%${phone}%` };
    if (leadId) whereConditions.id = leadId;
    if (activity_status)
      whereConditions.lead_status = { [Op.like]: `%${activity_status}` };
    if (verification_status) {
      whereConditions.verification_status = {
        [Op.or]: verification_status.map((status) => ({
          [Op.like]: `%${status}%`, // Use Op.iLike for case-insensitivity if supported
        })),
      };
    }
    if (lead_status) {
      whereConditions.lead_status = lead_status
    }
    if(application_status){
      whereConditions.application_status = {
        [Op.like]: `%${application_status}%`, // Use Op.iLike for case-insensitivity
      }
    }

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

    if(last_updated){
      const [startRange, endRange] = last_updated.split(',')
      if(startRange && endRange){
        const startOfRangeUTC = moment.tz(startRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
        const endOfRangeUTC = moment.tz(endRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
        whereConditions.updatedAt = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      }else{
        const startOfDayUTC = moment.tz(startRange, "Asia/Kolkata").startOf("day").utc().toDate();
        const endOfDayUTC = moment.tz(startRange, "Asia/Kolkata").endOf("day").utc().toDate();
        whereConditions.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    // lead source filter if lead_source is provided
    if(lead_source){
      whereConditions.lead_source = {
        [Op.like]: `%${lead_source}%`, // Use Op.iLike for case-insensitivity
      }
    }

    if (assigned_to) {
      if (assigned_to === "not_assigned") {
        whereConditions.id = {
          [Op.notIn]: sequelize.literal(`(SELECT lead_id FROM LeadAssignments)`),
        };
      } else {
        leadAssignmentConditions.assigned_to = assigned_to;
      }
    }

    if (assigned_to_name) {
      // Use `Op.like` to filter based on the assigned user's name
      leadAssignmentConditions["AssignedTo.name"] = {
        [Op.like]: `%${assigned_to_name}%`,
      };
    }

    if(assigned_on){
      const [startRange, endRange] = assigned_on.split(',')
      if(startRange && endRange){
        const startOfRangeUTC = moment.tz(startRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
        const endOfRangeUTC = moment.tz(endRange, "YYYY-MM-DDTHH:mm","Asia/Kolkata").utc().toDate();
        leadAssignmentConditions.updatedAt = {
          [Op.between]: [startOfRangeUTC, endOfRangeUTC],
        };
      }else{
        const startOfDayUTC = moment.tz(startRange, "Asia/Kolkata").startOf("day").utc().toDate();
        const endOfDayUTC = moment.tz(startRange, "Asia/Kolkata").endOf("day").utc().toDate();
        leadAssignmentConditions.updatedAt = {
          [Op.between]: [startOfDayUTC, endOfDayUTC],
        };
      }
    }

    const includeConditions = [
      {
        model: Activity,
        as: "Activities",
        required: false, // Include only if activity_status filter is provided
        order: [["createdAt", "DESC"]], // Ensure the most recent activity is first
        limit: 1, // Only include the most recent activity
      },
      {
        model: LeadAssignment,
        as: "LeadAssignments",
        required: assigned_to === "not_assigned" ? false : !!assigned_to || !!assigned_to_name || !!assigned_on,
        where: leadAssignmentConditions,
        include: [
          {
            model: User, // Assuming `User` is your `AssignedTo` model
            as: "AssignedTo", // Alias for the related `User` model
            attributes: ["name"], // Only include the name field
          },
        ],
      },
    ];

    if(for_walk_ins_page){
      includeConditions.push({
        model: WalkIn,
        as: 'walkIns',
        attributes: walk_in_attributes,
        required: false,
        order:[
          // [Sequelize.literal(`COALESCE(rescheduled_date_time, walk_in_date_time)`), "DESC"]
          ["id", "DESC"]
        ],
        limit: 1
      })
    }

    const shouldOrderByUpdatedAt = whereConditions?.verification_status || whereConditions?.lead_status || whereConditions?.activity_status;
    const orderConditions = shouldOrderByUpdatedAt
      ? [
          ["updatedAt", "DESC"], // Apply updatedAt sorting if verification_status is included
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ]
      : [
          ["createdAt", "DESC"], // Default ordering
          ["id", "DESC"],
        ];
      
    const isPaginationEnabled = isPaginationOff === 'false'
    const { count, rows } = await Lead.findAndCountAll({
      where: whereConditions,
      include: includeConditions,
      order: orderConditions,
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
      "Leads fetched successfully",
      rows,
      null,
      pagination
    );
  } catch (error) {
    console.error("Error fetching leads:", error);
    return ApiResponse(
      res,
      "ERROR",
      500,
      "Failed to fetch leads!",
      null,
      error,
      null
    );
  }
}

async function getLeadById(req, res) {
  try {
    const { leadId } = req.params;
    let {includeFields,walk_in_attributes=[]} = req.query

    includeFields = includeFields ? includeFields.split(',') : null

    if (!leadId) {
      return ApiResponse(res, "error", 400, "Lead Id is required!");
    }

    let queryOptions = {
      where: {id:leadId},
      attributes: includeFields?.length ? includeFields : undefined,
    }

    if (!includeFields) {
      queryOptions.include = [
        {
          model: Activity,
          as: "Activities",
          attributes: ["id", "activity_status", "docs_collected", "description", "createdAt", "follow_up"],
        },
      ];
    }

    if(walk_in_attributes.length > 0){
      queryOptions.include.push(
        {
          model: WalkIn,
          as: 'walkIns',
          attributes: walk_in_attributes,
          required: false,
          order:[
            ["id", "DESC"]
          ],
          limit: 1
        }
      )
    }
    // Fetch the lead by ID along with related data (activities and lead assignments)
    const lead = await Lead.findOne(queryOptions);

    // Check if the lead is found
    if (!lead) {
      return ApiResponse(res, "error", 400, "Lead not found!");
    }

    // Sort activities in JavaScript: first by createdAt in descending order, then by id in descending order
    if (lead.Activities && lead.Activities.length > 0) {
      lead.Activities.sort((a, b) => {
        // Sort by createdAt descending
        if (new Date(b.createdAt) - new Date(a.createdAt) !== 0) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        // If createdAt is the same, sort by id descending
        return b.id - a.id;
      });
    }

    // Return the lead data including activities and assignments
    return ApiResponse(res, "success", 200, "Lead fetched successfully", lead);
  } catch (error) {
    console.error("Error fetching lead by ID:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Internal server error",
      null,
      error.message
    );
  }
}

async function updateLeadReportsActivities(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const {userId,leadId,lead,loanReports,creditReports,activity,application_status,lead_status,role,rejection_reason,verification_status, docsCollectedPayload, lead_name} = req.body;

    // Validate if user exists
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return ApiResponse(res,"error",400,"User Not Found!",null,null,null);
    }

    // Validate role and application_status
    if (application_status && role !== ROLE_ADMIN && role !== ROLE_MANAGER) {
      await transaction.rollback();
      return ApiResponse(res, "error", 403, "Unauthorized Access!");
    }

    const validApplicationStatuses = [
      "Manager 1 Approved",
      "Manager 2 Approved",
      "Rejected",
      "Closed",
      "Login",
    ];

    if (application_status && !validApplicationStatuses.includes(application_status)) {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Invalid Application Status!");
    }

    // If application_status is provided, validate lead status
    if (application_status && verification_status !== "12 documents collected") {
      await transaction.rollback();
      return ApiResponse(res, "error", 400, "Application Status Cannot be Updated Now!");
    }

    // Define the update data for lead
    let updatedLead = null;
    const updateData = {};

    // 1. Update the Lead if the data is provided
    if (lead) {
      updatedLead = await LeadServices.updateLead(leadId, lead, transaction);
      let updatedFields = getUpdatedFields({name,email,city,salary,company,company_category_name} = lead, lead.prev_data)
      const activityLogs = Object.keys(updatedFields).map((field)=>({
        created_by : userId,
        activity_type : getActivityType(field),
        activity_desc : `${formatString(field)} updated from "${updatedFields[field].oldValue}" to "${updatedFields[field].newValue}"`,
        lead_id : leadId,
        lead_name : lead_name,
        status : 'active'
      }))
      await ActivityLog.bulkCreate(activityLogs, {transaction})
    }

    // 2. Update application status if provided
    if (application_status) {
      updateData.application_status = application_status;

      // Handle rejection reason if application status is "Rejected"
      if (application_status === "Rejected") {
        if (!rejection_reason) {
          await transaction.rollback();
          return ApiResponse(res, "error", 400, "Rejection reason is required!");
        }
        updateData.is_rejected = true;
        updateData.rejection_reason = rejection_reason;
      } else {
        // If the application status is not Rejected, set is_rejected to false and rejection_reason to null
        updateData.is_rejected = false;
        updateData.rejection_reason = null;
      }
      await LeadServices.updateLead(leadId, updateData, transaction);
      let logData = createLogData(ACTIVITY_LOGS.APPLICATION_STATUS_UPDATE(application_status), ACTIVITY_TYPES.APPLICATION_STATUS_UPDATE, userId, leadId, null, lead_name)
      await createActivityLog(logData, transaction)
    }

    let createdLoanReports = [];
    let createdCreditReports = [];
    let createdActivity = null;

    // 3. Create Loan Reports if provided
    if (loanReports && loanReports.length > 0) {
      createdLoanReports = await LoanReportServices.createLoanReports(loanReports, transaction);
      const activityLogs = loanReports.map((LoanReport)=>({
        created_by : userId,
        activity_type : ACTIVITY_TYPES.LOAN_REPORTS_UPDATE,
        activity_desc : ACTIVITY_LOGS.LOAN_REPORTS_UPDATE(LoanReport.loan_type, LoanReport.bank_name, LoanReport.loan_amount, LoanReport.emi, LoanReport.outstanding),
        lead_id : leadId,
        lead_name : lead_name,
        status : 'active'
      }))
      await ActivityLog.bulkCreate(activityLogs, {transaction})
    }

    // 4. Create Credit Reports if provided
    if (creditReports && creditReports.length > 0) {
      createdCreditReports = await CreditReportServices.createCreditReports(creditReports, transaction);
      const activityLogs = creditReports.map((CreditReport)=>({
        created_by : userId,
        activity_type : ACTIVITY_TYPES.CREDIT_REPORTS_UPDATE,
        activity_desc : ACTIVITY_LOGS.CREDIT_REPORTS_UPDATE(CreditReport.credit_card_name,CreditReport.total_outstanding),
        lead_id : leadId,
        lead_name : lead_name,
        status : 'active'
      }))
      await ActivityLog.bulkCreate(activityLogs, {transaction})
    }

    // 5. Add Activity if provided
    if (activity) {
      let pendingActivity = null
      if(["Follow Up", "Call Back", "Scheduled Call With Manager"].includes(activity.activity_status)){
        pendingActivity = await Activity.findOne({
          where:{
            lead_id: leadId,
            activity_status: ["Follow Up", "Call Back", "Scheduled Call With Manager"],
            task_status: { [Op.ne]: "Completed" }
          },
          transaction
        })
      }

      if(pendingActivity){
        await transaction.rollback()
        return ApiResponse(res, 'error', 400, "Previous task is pending! Please complete it before adding a new task.")
      }
      createdActivity = await ActivityServices.addActivity(activity, transaction);
      
      // if(activity.activity_status === "Verification 1"){
      //   await LeadServices.updateLead(leadId, {lead_status:activity.activity_status, verification_status:activity.activity_status}, transaction)
      // }else{
        await LeadServices.updateLead(leadId, {lead_status:activity.activity_status}, transaction)
      // } 

      let logData = null
      let logDataForDocsCollected = null
      if(["Follow Up", "Call Back", "Scheduled Call With Manager"].includes(activity.activity_status)){
        let logDataForTask = createLogData(ACTIVITY_LOGS.TASK_CREATE(activity.activity_status, activity.follow_up), ACTIVITY_TYPES.TASK_CREATE, userId, leadId, activity.description, lead_name)
        logData = createLogData(ACTIVITY_LOGS.LEAD_STATUS_UPDATE(activity.prev_status,activity.activity_status),ACTIVITY_TYPES.LEAD_STATUS_UPDATE, userId, leadId, activity.description, lead_name)
        await createActivityLog(logDataForTask, transaction)
        logDataForDocsCollected = createLogData(ACTIVITY_LOGS.DOCUMENTS_COLLECTED(activity.docs_collected), ACTIVITY_TYPES.DOCUMENTS_COLLECTED, activity.userId, activity.lead_id, null, lead_name)
      }else{
        logData = createLogData(ACTIVITY_LOGS.LEAD_STATUS_UPDATE(activity.prev_status,activity.activity_status),ACTIVITY_TYPES.LEAD_STATUS_UPDATE, userId, leadId, activity.description, lead_name)
        logDataForDocsCollected = createLogData(ACTIVITY_LOGS.DOCUMENTS_COLLECTED(activity.docs_collected), ACTIVITY_TYPES.DOCUMENTS_COLLECTED, activity.userId, activity.lead_id, null, lead_name)
      }

      if(activity.docs_collected !== activity.prev_docs_collected){
        await createActivityLog(logDataForDocsCollected, transaction)      
      }
      await createActivityLog(logData,transaction);
    }

    if(docsCollectedPayload){
      await ActivityServices.updateDocsCollectedByActivityId(docsCollectedPayload, transaction)
      let logData = createLogData(
        ACTIVITY_LOGS.DOCUMENTS_COLLECTED(docsCollectedPayload.docs_collected),
        ACTIVITY_TYPES.DOCUMENTS_COLLECTED,
        userId,
        leadId,
        null,
        lead_name
      )

      await createActivityLog(logData, transaction)
    }

    // Commit the transaction after all operations
    await transaction.commit();

    // Return the response with updated data
    return ApiResponse(res,"success",200,"Details updated successfully!",
      {
        updatedLead,
        createdLoanReports,
        createdCreditReports,
        createdActivity,
      },
      null,
      null
    );
  } catch (error) {
    // Rollback transaction on error
    if (transaction) await transaction.rollback();
    console.error("Error in updating lead and adding reports:", error);
    return ApiResponse(res,"error",500,"Failed to update details!",null,error,null);
  }
}

async function updateVerificationStatus(req, res) {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { lead_id, verification_status, role, rejection_reason, rejected_by_id, verification_status_note, user_id, lead_name } = req.body;

    if (!lead_id || !verification_status || !role) {
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    if (role !== ROLE_ADMIN && role !== ROLE_MANAGER) {
      return ApiResponse(
        res,
        "error",
        403,
        "You are not allowed to update verification status!",
        null,
        null,
        null
      );
    }

    const validStatuses = [
      "Under Review",
      "On Hold",
      "Manager 1 Approved",
      "Manager 2 Approved",
      "Approved for Walk-In",
      "Rejected",
    ];
    if (!VERIFICATION_STATUSES.includes(verification_status)) {
      return ApiResponse(res, "error", 400, "Invalid verification status!");
    }

    let updateData = {verification_status}
    if(verification_status === "Rejected"){
      if(!rejection_reason || !rejected_by_id){
        return ApiResponse(res, 'error', 400, "Rejection reason and Rejected by id is required !")
      }
      updateData.application_status = verification_status
      updateData.is_rejected = true
      updateData.rejection_reason = rejection_reason
      updateData.rejected_by_id = rejected_by_id
      updateData.rejected_at = moment().format('YYYY-MM-DD HH:mm:ss')
      updateData.updated_by = user_id
    }else{
      updateData.verification_status_note = verification_status_note
      updateData.application_status = null
      updateData.is_rejected = false
      updateData.rejection_reason = null
      updateData.rejected_by_id = null
      updateData.rejected_at = null
      updateData.updated_by = user_id
    }
    // Update lead
    const updatedLead = await LeadServices.updateLead(
      lead_id,
      updateData,
      transaction
    );

    await ActivityLog.create(
    {
      created_by : user_id,
      activity_type: ACTIVITY_TYPES.VERIFICATION_STATUS_UPDATE,
      activity_desc: `Updated Verification Status to : ${verification_status}`,
      lead_id:lead_id,
      note: verification_status === 'Rejected' ? rejection_reason : verification_status_note,
      lead_name: lead_name
    },
    {transaction}
  )

    await transaction.commit();
    return ApiResponse(
      res,
      "success",
      200,
      "Lead updated successfully",
      updatedLead,
      null,
      null
    );
  } catch (error) {
    if (transaction) await transaction.rollback(); // Rollback transaction if initialized
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to update verification status!",
      null,
      error,
      null
    );
  }
}

async function getTotalLeadsCount(req, res) {
  try {
    const {
      status = "active",
      lead_status,
      verification_status,
      today = "false",
      assigned_to,
    } = req.query;

    let leadConditions = {};
    let assignmentConditions = {};

    if (status) leadConditions.status = { [Op.like]: `%${status}%` };
    if (lead_status)
      leadConditions.lead_status = { [Op.like]: `%${lead_status}%` };
    if (verification_status)
      leadConditions.verification_status = {
        [Op.like]: `%${verification_status}%`,
      };

    // Filters for LeadAssignment
    if (assigned_to) assignmentConditions.assigned_to = assigned_to;

    // Handle 'today' filter: Convert IST to UTC
    if (today === "true") {
      // Get today's date in IST
      const todayStartIST = moment.tz("Asia/Kolkata").startOf("day").toDate();
      const todayEndIST = moment.tz("Asia/Kolkata").endOf("day").toDate();

      // Convert to UTC
      const todayStartUTC = moment(todayStartIST).utc().toDate();
      const todayEndUTC = moment(todayEndIST).utc().toDate();

      console.log("Date range in UTC:", todayStartUTC, todayEndUTC);

      if (assigned_to) {
        // Apply to LeadAssignment's `createdAt` if `assigned_to` is provided
        assignmentConditions.createdAt = {
          [Op.between]: [todayStartUTC, todayEndUTC],
        };
      } else {
        // Apply date range to Lead's `createdAt`
        leadConditions.createdAt = {
          [Op.between]: [todayStartUTC, todayEndUTC],
        };
      }
    }

    let totalLeads = 0;

    if (assigned_to) {
      // Count leads based on assigned_to and today filters in LeadAssignment
      totalLeads = await LeadAssignment.count({
        where: assignmentConditions,
        include: [
          {
            model: Lead,
            as: "Lead", // Ensure this matches the alias in your model associations
            where: leadConditions, // Apply Lead filters here
          },
        ],
      });
    } else {
      // Otherwise, count directly from the Lead table
      totalLeads = await Lead.count({
        where: leadConditions,
      });
    }

    console.log("Total leads count:", totalLeads);

    // Return the response
    return ApiResponse(
      res,
      "success",
      200,
      "Leads count fetched successfully",
      totalLeads === 0 ? totalLeads.toString() : totalLeads,
      null,
      null
    );
  } catch (error) {
    console.error("Error fetching leads count:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to fetch total leads count!",
      null,
      error,
      null
    );
  }
}

async function updateApplicationStatus(req,res){
  const transaction = await sequelize.transaction()
  try {
    const {lead_id, application_status, lead_status, role, rejection_reason, application_status_note, rejected_by_id, user_id, lead_name} = req.body

    if(!lead_id || !application_status || !lead_status || !role){
      return ApiResponse(res, 'error', 400, "Missing required fields !")
    }

    if (role !== ROLE_ADMIN && role !== ROLE_MANAGER) {
      return ApiResponse(res,'error', 403, "Unauthorized Access !")
    }

    const validApplicationStatuses = [
      "Manager 1 Approved",
      "Manager 2 Approved",
      "Rejected",
      "Closed",
      "Login",
      "Normal Login"
    ]

    if(!validApplicationStatuses.includes(application_status)){
      return ApiResponse(res,'error',400, "Invalid Appliation Status !")
    }

    if(lead_status !== "12 documents collected"){
      return ApiResponse(res, 'error', 400, "Application Status Cannot Updated Now !")
    }

    const updateData = {application_status}

    if(application_status === "Rejected"){
      if(!rejection_reason){
        return ApiResponse(res, 'error', 400, "Rejection reason is required !")
      }
      updateData.is_rejected = true
      updateData.rejection_reason = rejection_reason
      updateData.rejected_by_id = rejected_by_id
      updateData.rejected_at = moment().format('YYYY-MM-DD HH:mm:ss')
      updateData.updated_by = user_id
    } else {
      // If the application status is not Rejected, set is_rejected to false and rejection_reason to null
      updateData.application_status_note = application_status_note
      updateData.is_rejected = false;
      updateData.rejection_reason = null;
      updateData.rejected_by_id = null;
      updateData.rejected_at = null;
      updateData.updated_by = user_id
    }

    const updatedLead = await LeadServices.updateLead(lead_id,updateData,transaction)

    await ActivityLog.create({
      created_by : user_id,
      activity_type: ACTIVITY_TYPES.APPLICATION_STATUS_UPDATE,
      activity_desc: `Updated Application Status to : ${application_status}`,
      lead_id:lead_id,
      note: application_status === "Rejected" ? rejection_reason : application_status_note,
      lead_name: lead_name
    },
    {transaction}
  )

    await transaction.commit()
    return ApiResponse(res, 'success', 200, "Lead updated with application status successfully.", updatedLead, null,null)
  } catch (error) {
    if(transaction) await transaction.rollback()
    console.log(error);
    return ApiResponse(res,'error', 500, "Failed to update application status !", null,error,null)
  }
}

async function updateLeadStatus(req,res){
  const transaction = await sequelize.transaction()
  try {
      const {lead_id, lead_status, role, lead_name, prev_lead_status, user_id} = req.body

      if(!lead_id || !lead_status || !role){
        return ApiResponse(res, 'error', 400, "Missing required fields !")
      }

      if (role !== ROLE_EMPLOYEE) {
        return ApiResponse(res,'error', 403, "Only Employee can change lead status !")
      }

      if(!LEAD_STATUSES.includes(lead_status)){
        return ApiResponse(res,'error',400, "Invalid Appliation Status !")
      }

      const updatedLead = await LeadServices.updateLead(lead_id,{lead_status}, transaction)

      let logData = createLogData(
        ACTIVITY_LOGS.LEAD_STATUS_UPDATE(prev_lead_status, lead_status),
        ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
        user_id,
        lead_id,
        null,
        lead_name
      )
      await createActivityLog(logData, transaction)

      await transaction.commit()

      return ApiResponse(res, 'success', 200, "Lead with new lead status updated successfully.", updatedLead, null, null)
  } catch (error) {
    if(transaction) await transaction.rollback()
    console.log(error);
    return ApiResponse(res,'error', 500, "Failed to update lead status !", null, error, null)
  }
}

async function getAllDistinctLeadSources(req,res){
  try {
    let [leadSources] = await sequelize.query(
      `SELECT DISTINCT lead_source AS lead_source FROM ${process.env.DB_NAME}.Leads WHERE lead_source IS NOT NULL;`,
    )
    leadSources = leadSources.map((row)=>row.lead_source)
    return ApiResponse(res, 'success', 200, "Lead Sources fetched successfully.", leadSources)
  } catch (error) {
    return ApiResponse(res, 'error', 500, "Failed to fetch lead sources !", null, error, null)
  }
}

async function getLeadSourceByName(req,res){
  try {
    const {lead_source_name} = req.query

    if(!lead_source_name){
      return ApiResponse(res, 'error', 400, "Lead Source Name is required !")
    }

    let [leadSources] = await sequelize.query(
      `SELECT DISTINCT lead_source AS lead_source
       FROM ${process.env.DB_NAME}.Leads
       WHERE lead_source LIKE :leadSourceName AND lead_source IS NOT NULL;`,
      {
        replacements: { leadSourceName: `%${lead_source_name}%` }, // Allow partial matching
      }
    );

    leadSources = leadSources.map((row)=>row.lead_source)

    return ApiResponse(res, 'success', 200, "Lead Sources fetched successfully", leadSources)
  } catch (error) {
    return ApiResponse(res, 'error', 500, "Failed to fetch lead source by name !", null,error,null)
  }
}

async function updateLeadDetails(req,res){
  try {
     const {id} = req.params
     
     if(!id){
      return ApiResponse(res, 'error', 400, "Lead ID is required !")
     }

     if(Object.keys(req.body).length === 0){
      return ApiResponse(res, 'error', 400, "update details are required !")
     }

     const [updatedRowCount] = await Lead.update(req.body,{
      where: {id}
     })

     if(updatedRowCount===0){
      return ApiResponse(res, 'error', 404, "Lead not found !")
     }

     return ApiResponse(res, 'success', 200, "Lead updated successfully 1")

  } catch (error) {
    return ApiResponse(res, 'error', 500, "Failed to update lead details !", null,error,null)
  }
}

module.exports = {
  createBulkLeads,
  getAllLeadsWithPagination,
  getLeadById,
  updateLeadReportsActivities,
  updateVerificationStatus,
  getTotalLeadsCount,
  updateApplicationStatus,
  updateLeadStatus,
  getAllDistinctLeadSources,
  getLeadSourceByName,
  updateLeadDetails
};
