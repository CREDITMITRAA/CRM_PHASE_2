const ACTIVITY_LOGS = {
    ASSIGN_LEAD : (leadId, assignedTo, assignedBy) =>
    `Lead ID ${leadId} assigned to ${assignedTo} by ${assignedBy}`
}

const ACTIVITY_TYPES = {
    LEAD_ASSIGNMENT: 'LEAD_ASSIGNMENT'
}

module.exports = {
    ACTIVITY_LOGS,
    ACTIVITY_TYPES  
}