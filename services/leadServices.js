const { Op } = require("sequelize");
const {
  Lead,
  sequelize,
  LeadAssignment,
  Activity,
  WalkIn,
  User
} = require("../models");
const moment = require("moment-timezone");
const { leadBuckets } = require("../utilities/constants");

async function updateLead(leadId, leadData, transaction) {
  if (!leadId) {
    throw new Error("Lead ID is required to update the lead.");
  }
  const lead = await Lead.findByPk(leadId, { transaction });
  if (!lead) {
    throw new Error(`Lead with ID ${leadId} not found.`);
  }
  await lead.update(leadData, { transaction });
  return lead; // Return the updated lead
}

async function getLead(leadId, transaction) {
  if (!leadId) {
    throw new Error("Lead ID is required to update the lead.");
  }
  const lead = await Lead.findByPk(leadId, { transaction });
  return lead;
}

async function getLeadByPhone(phone, transaction = null) {
  if (!phone) {
    throw new Error("Phone is required to fetch the lead");
  }

  // Primary phone
  let lead = await Lead.findOne({
    where: { phone },
    attributes: ["id", "name"],
    raw: true,
    ...(transaction && { transaction }),
  });

  if (!lead) {
    // Check in alternate_phones JSON (ARRAY_CONTAINS)
    lead = await Lead.findOne({
      where: sequelize.literal(`JSON_CONTAINS(alternate_phones, '"${phone}"')`),
      attributes: ["id", "name"],
      raw: true,
      ...(transaction && { transaction }),
    });
  }

  return lead;
}

async function getLeadNamesByLeadIds(leadIds, transaction) {
  if (!leadIds || leadIds.length === 0) {
    throw new Error("Lead ids cannot be empty !");
  }

  const leads = await Lead.findAll({
    where: { id: leadIds },
    attributes: ["id", "name"],
    transaction,
  });

  return leads;
}

async function getAssignedLeads(filters, paginationData, transaction) {
  const whereAssignment = { status: "active" };
  const whereLead = {};

  // lead assignment filters
  if (filters.leadId)
    whereAssignment.lead_id = { [Op.like]: `%${filters.leadId}%` };
  if (filters.assigned_to)
    whereAssignment.assigned_to = parseInt(filters.assigned_to);
  if (filters.assigned_by) whereAssignment.assigned_by = filters.assigned_by;
  if (filters.assigned_on) {
    const [startRange, endRange] = filters.assigned_on.split(",");

    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DD HH:mm", "Asia/Kolkata")
        .startOf("minute")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DD HH:mm", "Asia/Kolkata")
        .endOf("minute")
        .utc()
        .toDate();

      console.log("Filtered Start UTC:", startOfRangeUTC);
      console.log("Filtered End UTC:", endOfRangeUTC);

      whereAssignment.updatedAt = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "YYYY-MM-DD", "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "YYYY-MM-DD", "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereAssignment.updatedAt = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }

  // lead filters
  if (filters.phone) whereLead.phone = { [Op.like]: `%${filters.phone}%` };
  if (filters.email) whereLead.email = { [Op.like]: `%${filters.email}%` };
  if (filters.name) whereLead.name = { [Op.like]: `%${filters.name}%` };
  if (filters.lead_bucket) whereLead.lead_bucket = filters.lead_bucket;
  if (filters.lead_source) whereLead.lead_source = filters.lead_source;
  if (filters.last_updated_status)
    whereLead.last_updated_status = filters.last_updated_status;
  if (filters.utm_campaign)
    whereLead.utm_campaign = { [Op.like]: `%${filters.utm_campaign}%` };
  if (filters.utm_source)
    whereLead.utm_source = { [Op.like]: `%${filters.utm_source}%` };
  if (filters.importedOn) {
    const [startRange, endRange] = filters.importedOn.split(",");
    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      whereLead.createdAt = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereLead.createdAt = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }
  if (filters.last_updated) {
    const [startRange, endRange] = filters.last_updated.split(",");
    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      whereLead.updatedAt = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereLead.updatedAt = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }

  // first find the lead assignments
  const { count, rows: assignedLeads } = await LeadAssignment.findAndCountAll({
    where: whereAssignment,
    include: [
      {
        model: Lead,
        as: "Lead",
        where: whereLead,
        required: true,
        // attributes: [] add attributes while integrating with FE
      },
    ],
    order: [["id", "DESC"]],
    limit: paginationData.pageSize,
    offset: paginationData.offset,
    transaction,
  });

  let pagination = {
    page: paginationData.page,
    pageSize: paginationData.pageSize,
    total: count,
    totalPages: Math.ceil(count / paginationData.pageSize),
  };

  return {
    leads: assignedLeads,
    pagination,
  };
}

async function getUnAssignedLeads(filters, paginationData, transaction) {
  let whereLead = { status: "active" };

  if (filters.leadId) whereLead.id = { [Op.like]: `%${filters.leadId}%` };
  if (filters.phone) whereLead.phone = { [Op.like]: `%${filters.phone}%` };
  if (filters.name) whereLead.name = { [Op.like]: `%${filters.name}%` };
  if (filters.lead_source) whereLead.lead_source = filters.lead_source;
  if (filters.utm_campaign)
    whereLead.utm_campaign = { [Op.like]: `%${filters.utm_campaign}%` };
  if (filters.utm_source)
    whereLead.utm_source = { [Op.like]: `%${filters.utm_source}%` };
  if (filters.importedOn) {
    const [startRange, endRange] = filters.importedOn.split(",");
    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      whereLead.createdAt = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereLead.createdAt = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }

  // first find all lead_ids already assigned
  const assignedLeadIds = await LeadAssignment.findAll({
    where: { status: "active" },
    attributes: ["lead_id"],
    raw: true,
    transaction,
  });

  const assignedIds = assignedLeadIds.map((a) => a.lead_id);
  // exclude the above lead ids
  if (assignedIds.length > 0) {
    if (whereLead.id) {
      whereLead.id = {
        [Op.and]: [{ [Op.eq]: whereLead.id }, { [Op.notIn]: assignedIds }],
      };
    } else {
      whereLead.id = { [Op.notIn]: assignedIds };
    }
  }

  // now fetch unassigned leads normally
  const { count, rows: unAssignedLeads } = await Lead.findAndCountAll({
    where: whereLead,
    order: [["id", "DESC"]],
    limit: paginationData.pageSize,
    offset: paginationData.offset,
    transaction,
  });

  let pagination = {
    page: paginationData.page,
    pageSize: paginationData.pageSize,
    total: count,
    totalPages: Math.ceil(count / paginationData.pageSize),
  };

  return {
    leads: unAssignedLeads,
    pagination,
  };
}

async function getPreliminaryApprovalLeads(
  filters,
  paginationData,
  transaction
) {
  let whereLead = {
    status: "active",
    lead_bucket: leadBuckets.PRELIMINERY_CHECK,
  };
  let whereLeadAssignment = {};

  if (filters.leadId) whereLead.id = { [Op.like]: `%${filters.leadId}%` };
  if (filters.phone) whereLead.phone = { [Op.like]: `%${filters.phone}%` };
  if (filters.name) whereLead.name = { [Op.like]: `%${filters.name}%` };
  if (filters.verification_status)
    whereLead.verification_status = {
      [Op.like]: `%${filters.verification_status}%`,
    };
  if (filters.lead_status)
    whereLead.lead_status = { [Op.like]: `%${filters.lead_status}%` };
  if (filters.lead_source) whereLead.lead_source = filters.lead_source;

  if (filters.assigned_to)
    whereLeadAssignment.assigned_to = parseInt(filters.assigned_to);

  const { count, rows: leads } = await Lead.findAndCountAll({
    where: whereLead,
    include: [
      {
        model: LeadAssignment,
        as: "LeadAssignments",
        where: whereLeadAssignment,
        required: true,
      },
    ],
    order: [["id", "DESC"]],
    limit: paginationData.pageSize,
    offset: paginationData.offset,
    transaction,
  });

  let pagination = {
    page: paginationData.page,
    pageSize: paginationData.pageSize,
    total: count,
    totalPages: Math.ceil(count / paginationData.pageSize),
  };

  return {
    leads,
    pagination,
  };
}

async function getAppointmentLeads(filters, paginationData, transaction) {
  let whereLead = { status: "active", lead_bucket: leadBuckets.APPOINTMENTS };
  let whereWalkIn = { status: "active" };
  let whereAssignment = {};

  if (filters.leadId) whereLead.id = { [Op.like]: `%${filters.leadId}%` };
  if (filters.phone) whereLead.phone = { [Op.like]: `%${filters.phone}%` };
  if (filters.name) whereLead.name = { [Op.like]: `%${filters.name}%` };
  if (filters.lead_source) whereLead.lead_source = filters.lead_source;
  if (filters.lead_status) whereLead.lead_status = { [Op.like]: `%${filters.lead_status}%` };
  if (filters.application_status) whereLead.application_status = { [Op.like]: `%${filters.application_status}%` };

  if (filters.assigned_to) whereAssignment.assigned_to = parseInt(filters.assigned_to);

  // Build appointment date filter
  if (filters.appointment_date) {
    const [startRange, endRange] = filters.appointment_date.split(",");
    
    if (startRange && endRange) {
      const startOfRangeUTC = moment.tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata").utc().toDate();
      const endOfRangeUTC = moment.tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata").utc().toDate();
      
      whereWalkIn[Op.and] = [
        {
          [Op.or]: [
            { is_rescheduled: false, walk_in_date_time: { [Op.between]: [startOfRangeUTC, endOfRangeUTC] } },
            { is_rescheduled: true, rescheduled_date_time: { [Op.between]: [startOfRangeUTC, endOfRangeUTC] } }
          ]
        }
      ];
    } else {
      const startOfDayUTC = moment.tz(startRange, "Asia/Kolkata").startOf("day").utc().toDate();
      const endOfDayUTC = moment.tz(startRange, "Asia/Kolkata").endOf("day").utc().toDate();
      
      whereWalkIn[Op.and] = [
        {
          [Op.or]: [
            { is_rescheduled: false, walk_in_date_time: { [Op.between]: [startOfDayUTC, endOfDayUTC] } },
            { is_rescheduled: true, rescheduled_date_time: { [Op.between]: [startOfDayUTC, endOfDayUTC] } }
          ]
        }
      ];
    }
  }

  // Query WalkIns first, then get associated Leads
  const { count, rows: walkIns } = await WalkIn.findAndCountAll({
    where: whereWalkIn,
    include: [
      {
        model: Lead,
        as: "lead",
        where: whereLead,
        required: true,
        include: [
          {
            model: LeadAssignment,
            as: "LeadAssignments",
            where: whereAssignment,
            required: false,
            order: [["id", "DESC"]],
          },
          {
            model: Activity,
            as: "Activities",
            required: false,
            separate: true,
            order: [["id", "DESC"]],
          }
        ]
      }
    ],
    order: [["id", "DESC"]],
    limit: paginationData.pageSize,
    offset: paginationData.offset,
    transaction,
    distinct: true,
  });

  // FIX: Create clean objects and remove circular references
  const leads = walkIns.map(walkIn => {
    if (!walkIn.lead) return null;
    
    // Create a clean lead object without the circular reference
    const cleanLead = walkIn.lead.get({ plain: true });
    
    // Create a clean walkIn object WITHOUT the nested lead
    const cleanWalkIn = walkIn.get({ plain: true });
    delete cleanWalkIn.lead; // Remove the circular reference
    
    // Add the clean walkIn to the lead
    cleanLead.walkIns = [cleanWalkIn];
    
    return cleanLead;
  }).filter(lead => lead !== null);

  let pagination = {
    page: paginationData.page,
    pageSize: paginationData.pageSize,
    total: count,
    totalPages: Math.ceil(count / paginationData.pageSize),
  };

  return {
    leads,
    pagination,
  };
}

async function getApprovedApplicationLeads(filters, paginationData){
  let whereLead = { status: 'active', lead_bucket: leadBuckets.APPROVED_APPLICATIONS }
  let whereAssignment = {}

  if (filters.leadId) whereLead.id = { [Op.like]: `%${filters.leadId}%` };
  if (filters.phone) whereLead.phone = { [Op.like]: `%${filters.phone}%` };
  if (filters.name) whereLead.name = { [Op.like]: `%${filters.name}%` };
  if (filters.lead_source) whereLead.lead_source = filters.lead_source;
  if (filters.lead_status) whereLead.lead_status = { [Op.like]: `%${filters.lead_status}%` };
  if (filters.application_status) whereLead.application_status = { [Op.like]: `%${filters.application_status}%` };
  if (filters.is_paid !== undefined && filters.is_paid !== '') {
    whereLead.is_paid = filters.is_paid === 'true' || filters.is_paid === true;
  }
  if (filters.closing_date) {
    const [startRange, endRange] = filters.closing_date.split(",");
    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      whereLead.closing_date = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereLead.closing_date = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }

  if (filters.verification_date) {
    const [startRange, endRange] = filters.verification_date.split(",");
    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      whereLead.verification_date = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereLead.verification_date = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }

  if (filters.login_date) {
    const [startRange, endRange] = filters.login_date.split(",");
    if (startRange && endRange) {
      const startOfRangeUTC = moment
        .tz(startRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      const endOfRangeUTC = moment
        .tz(endRange, "YYYY-MM-DDTHH:mm", "Asia/Kolkata")
        .utc()
        .toDate();
      whereLead.login_date = {
        [Op.between]: [startOfRangeUTC, endOfRangeUTC],
      };
    } else {
      const startOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .startOf("day")
        .utc()
        .toDate();
      const endOfDayUTC = moment
        .tz(startRange, "Asia/Kolkata")
        .endOf("day")
        .utc()
        .toDate();
      whereLead.login_date = {
        [Op.between]: [startOfDayUTC, endOfDayUTC],
      };
    }
  }

  if (filters.assigned_to) whereAssignment.assigned_to = parseInt(filters.assigned_to);

  const { count, rows:leads } = await Lead.findAndCountAll({
    where: whereLead,
    include: [
      {
        model: LeadAssignment,
        as: "LeadAssignments",
        where: whereAssignment,
        required: false
      }
    ],
    order: [["id", "DESC"]],
    limit: paginationData.pageSize,
    offset: paginationData.offset,
  })

  let pagination = {
    page: paginationData.page,
    pageSize: paginationData.pageSize,
    total: count,
    totalPages: Math.ceil(count / paginationData.pageSize),
  };

  return {
    leads,
    pagination,
  };
}

async function getLeadDistributionCounts(filters = {}) {
  try {

    const baseWhere = {
      status: 'active',
      ...filters
    };

    // Get all active lead assignments with employee info
    const assignments = await LeadAssignment.findAll({
      include: [
        {
          model: Lead,
          as: 'Lead',
          where: baseWhere,
          required: true
        },
        {
          model: User,
          as: 'AssignedTo',
          attributes: ['id', 'name'],
          required: true
        }
      ],
      where: {
        // status: 'active'
      },
      raw: true
    });

    // Group by employee
    const employeeMap = new Map();

    assignments.forEach(assignment => {
      const employeeId = assignment.assigned_to;
      const employeeName = assignment['AssignedTo.name'];
      
      if (!employeeMap.has(employeeId)) {
        employeeMap.set(employeeId, {
          employee: employeeName,
          leads: []
        });
      }
      
      // Store lead data for counting
      employeeMap.get(employeeId).leads.push({
        lead_bucket: assignment['Lead.lead_bucket'],
        lead_status: assignment['Lead.lead_status'],
        application_status: assignment['Lead.application_status'],
        verification_status: assignment['Lead.verification_status']
      });
    });

    // Calculate counts for each employee
    const result = Array.from(employeeMap.values()).map(employeeData => {
      const leads = employeeData.leads;
      
      // Bucket counts
      const pipeline_entries = leads.filter(lead => lead.lead_bucket === 'PIPELINE_ENTRIES').length;
      const preliminary_approval = leads.filter(lead => lead.lead_bucket === 'PRELIMINERY_CHECK').length;
      const appointments = leads.filter(lead => lead.lead_bucket === 'APPOINTMENTS').length;
      const approved_applications = leads.filter(lead => lead.lead_bucket === 'APPROVED_APPLICATIONS').length;
      const logins = leads.filter(lead => lead.lead_bucket === 'LOGINS').length;
      
      // Status counts
      const statusCounts = {};
      const applicationStatusCounts = {};
      const verificationStatusCounts = {};
      
      leads.forEach(lead => {
        // Count lead_status
        if (lead.lead_status) {
          statusCounts[lead.lead_status] = (statusCounts[lead.lead_status] || 0) + 1;
        }
        
        // Count application_status
        if (lead.application_status) {
          applicationStatusCounts[lead.application_status] = (applicationStatusCounts[lead.application_status] || 0) + 1;
        }
        
        // Count verification_status
        if (lead.verification_status) {
          verificationStatusCounts[lead.verification_status] = (verificationStatusCounts[lead.verification_status] || 0) + 1;
        }
      });
      
      const totalLeads = leads.length;
      const conversionRate = totalLeads > 0 ? ((approved_applications / totalLeads) * 100).toFixed(4) : 0;
      
      return {
        employee: employeeData.employee,
        pipeline_entries,
        preliminary_approval,
        appointments,
        approved_applications,
        logins,
        totalLeads,
        statusCounts,
        applicationStatusCounts,
        verificationStatusCounts,
        conversionRate: parseFloat(conversionRate)
      };
    });

    return result;

  } catch (error) {
    console.error('Error getting lead distribution counts:', error);
    throw error;
  }
}

module.exports = {
  updateLead,
  getLead,
  getLeadByPhone,
  getLeadNamesByLeadIds,
  getAssignedLeads,
  getUnAssignedLeads,
  getPreliminaryApprovalLeads,
  getAppointmentLeads,
  getApprovedApplicationLeads,
  getLeadDistributionCounts
};
