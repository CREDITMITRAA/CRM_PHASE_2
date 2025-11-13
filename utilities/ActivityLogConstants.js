const { START_LOGIN, UNDER_PROCESS, DISBURSED_FROM_BANKS } = require("./constants");

const ACTIVITY_TYPES = {
    LEAD_ASSIGNMENT: 'LEAD_ASSIGNMENT',
    LEAD_REASSIGNMENT: 'LEAD_REASSIGNMENT',
    APPLICATION_STATUS_UPDATE: 'APPLICATION_STATUS_UPDATE',
    VERIFICATION_STATUS_UPDATE : 'VERIFICATION_STATUS_UPDATE',
    LEAD_STATUS_UPDATE : 'LEAD_STATUS_UPDATE',
    TASK_CREATE : 'TASK_CREATE',
    PAYSLIP_UPLOAD : 'PAYSLIP_UPLOAD',
    CREDIT_BUREAU_UPLOAD : 'CREDIT_BUREAU_UPLOAD',
    NAME_UPDATE : 'NAME_UPDATE',
    EMAIL_UPDATE : 'EMAIL_UPDATE',
    CITY_UPDATE : 'CITY_UPDATE',
    SALARY_UPDATE : 'SALARY_UPDATE',
    COMPANY_UPDATE : 'COMPANY_UPDATE',
    COMPANY_CATEGORY_UPDATE : 'COMPANY_CATEGORY_UPDATE',
    LOAN_REPORTS_UPDATE : 'LOAN_REPORTS_UPDATE',
    CREDIT_REPORTS_UPDATE : 'CREDIT_REPORTS_UPDATE',
    LOAN_REPORT_DELETE : 'LOAN_REPORT_DELETE',
    CREDIT_REPORT_DELETE : 'CREDIT_REPORT_DELETE',
    WALK_IN_SCHEDULE : 'WALK_IN_SCHEDULE',
    WALK_IN_RESCHEDULE : 'WALK_IN_RESCHEDULE',
    TASK_UPDATE : 'TASK_UPDATE',
    WALK_IN_UPDATE : 'WALK_IN_UPDATE',
    PAYSLIP_DELETE : 'PAYSLIP_DELETE',
    OTHER_DOC_UPLOAD : 'OTHER_DOC_UPLOAD',
    OTHER_DOC_DELETE : 'OTHER_DOC_DELETE',
    CREDIT_BUREAU_DELETE : 'CREDIT_BUREAU_DELETE',
    DOCUMENTS_COLLECTED : 'DOCUMENTS_COLLECTED',
    CALL_SCHEDULE_WITH_MANAGER : 'CALL_SCHEDULE_WITH_MANAGER',
    RESCHEDULE_CALL_WITH_MANAGER : 'RESCHEDULE_CALL_WITH_MANAGER',
    ADD_ACTIVITY_LOG_NOTE : 'ADD_ACTIVITY_LOG_NOTE',
    LEAD_SOURCE_UPDATE : 'LEAD_SOURCE_UPDATE',
    BEREAU_NAME_UPDATE : 'BEREAU_NAME_UPDATE',
    BEREAU_SCORE_UPDATE : 'BEREAU_SCORE_UPDATE',
    LEAD_UPDATE: 'LEAD_UPDATE',
    LOAN_REPORT_ADD : 'LOAN_REPORT_ADD',
    CREDIT_REPORT_ADD : 'CREDIT_REPORT_ADD',
    LOAN_REPORT_EDIT : 'LOAN_REPORT_EDIT',
    CREDIT_REPORT_EDIT : 'CREDIT_REPORT_EDIT',
    LOGIN_ADD : 'LOGIN_ADD',
    LOGIN_EDIT : "LOGIN_EDIT",
    LOGIN_DELETE: "LOGIN_DELETE",
    CLOSING_DOC_UPLOAD: "CLOSING_DOC_UPLOAD",
    CLOSING_DOC_DELETE: "CLOSING_DOC_DELETE",
    CALL_LOG_ADDED: 'CALL_LOG_ADDED'
}

const ASSIGNED_TABLE = "ASSIGNED_TABLE";
const NOT_ASSIGNED_TABLE = "NOT_ASSIGNED_TABLE";
const INVALID_LEADS_TABLE = "INVALID_LEADS_TABLE";
const EX_EMPLOYEES_LEADS_TABLE = "EX_EMPLOYEES_LEADS_TABLE";
const EXPORT_LEADS = "EXPORT_LEADS";
const UNDER_REVIEW = "Under Review";
const ON_HOLD = "On Hold";
const MANAGER_1_APPROVED = "Manager 1 Approved";
const MANAGER_2_APPROVED = "Manager 2 Approved";
const APPROVED_FOR_WALK_IN = "Approved for Walk-In";
const REJECTED = "Rejected";
const NORMAL_LOGIN = "Normal Login";
const CLOSED = "Closed";
const LOGIN = "Login";
const SCHEDULED_FOR_WALK_IN = "Scheduled For Walk-In";
const SCHEDULED_CALL_WITH_MANAGER = "Scheduled Call With Manager";
const OKAY_FOR_POLICY = "Okay for Policy";
const THINK_AND_GET_BACK = "Think and get back";
const TWELVE_DOCUMENTS_COLLECTED = "12 documents collected";
const NOT_OKAY_FOR_POLICY = "Not okay for Policy";
const OTHERS = "Others";
const ROLE_ADMIN = "ROLE_ADMIN";
const ROLE_MANAGER = "ROLE_MANAGER";
const ROLE_EMPLOYEE = "ROLE_EMPLOYEE";
const ADMIN = "Admin";
const MANAGER = "Manager";
const EMPLOYEE = "Employee";
const PAYSLIP = "payslip";
const CREDIT_BUREAU = "creditBureau";
const OTHER_DOCS = "otherDocs";
const PERSONAL_LOAN = "Personal Loan";
const HOME_LOAN = "Home Loan";
const GOLD_LOAN = "Gold Loan";
const INTERESTED = "Interested";
const FOLLOW_UP = "Follow Up";
const CALL_BACK = "Call Back";
const RNR_RING_NO_RESPONSE = "RNR ( Ring No Response )";
const SWITCHED_OFF = "Switched Off";
const BUSY = "Busy";
const NOT_INTERESTED = "Not Interested";
const NOT_WORKING_NOT_REACHABLE = "Not Working / Not Reachable";
const NOT_POSSIBLE = "Not Possible";
const VERIFICATION_1 = "Verification 1";
const SCHEDULE_FOR_WALK_IN = "Schedule For Walk-In";
const SCHEDULE_CALL_WITH_MANAGER = "Schedule Call With Manager";
const RESCHEDULE_WALK_IN = "Reschedule Walk-In";
const RESCHEDULE_CALL_WITH_MANAGER = "Reschedule Call With Manager";
const UPCOMING = "Upcoming";
const PENDING = "Pending";
const CANCELLED = "Cancelled";
const LEADS = "Leads";
const WALK_INS = "Walk-Ins";
const EMPLOYEES = "Employees";
const NOT_CONTACTED = "Not Contacted";
const APPLICATION_CLOSED = "Closed";
const RESCHEDULED_FOR_WALK_IN = "Re-Scheduled For Walk-In";
const MALE = "male";
const FEMALE = "female";
const ALL_CLEAR = "All Clear"
const NEGATIVE_TRANSACTION = "Negative Transaction"
const LOAN_DISBURSED_FROM_BANK = "Loan Disbursed From Bank"
const APPLICATION_IS_CLOSED = "Application Closed"
const LOGIN_STARTED = "Login Started"
const ALL_POSITIVE = "All Positive"
const ALL_LOANS_CLOSED = "All Loans Closed"
const ALL_CLOSURE_DOCUMENTS_VERIFIED = "All Closure Documents Verified"
const ALL_LOGIN_DOCUMENTS_VERIFIED = "All Login Documents Verified"
const BUREAU_DISPUTE_RAISED = "Bureau Dispute Raised"
const ALL_DISPUTES_UPDATED = "All Disputes Updated"
const LOGIN_BANK_1 = "Login Bank 1"
const LOGIN_BANK_2 = "Login Bank 2"
const LOGIN_BANK_3 = "Login Bank 3"
const LOGIN_BANK_4 = "Login Bank 4"
const LOGIN_BANK_5 = "Login Bank 5"
const LOGIN_BANK_6 = "Login Bank 6"
const APPLICATION_APPROVED = "Application Approved"
const CLOSING_DATE_CHANGED = "Closing Date Changed"
const ADVANCE_AMOUNT_PAID = "Advance Amount Paid"
const CLOSING_AMOUNT_PAID = "Closing Amount Paid"
const LOGIN_DATE_CHANGED = "Login Date Changed"
const APPOINTMENT_PENDING = "Appointment Pending"
const APPOINTMENT_COMPLETED = "Appointment Cancelled"
const APPOINTMENT_CANCELLED = "Appointment Completed"
const APPOINTMENT_RESCHEDULED = "Appointment Rescheduled"
const ADVISOR_CONSULTATION_PENDING = "Advisor Consultation Pending"
const ADVISOR_CONSULTATION_COMPLETED = "Advisor Consultation Completed"
const ADVISOR_CONSULTATION_CANCELLED = "Advisor Consultation Cancelled"
const ADVISOR_CONSULTATION_RESCHEDULED = "Advisor Consultation Rescheduled"
const MAKER_APPROVED = "Maker Approved"
const CHECKER_APPROVED = "Checker Approved"
const SEND_TO_LOGIN = "Send To Login"
const APPLICATION_ON_HOLD = "Application On Hold"

const terminologiesMap = new Map([
    [NOT_CONTACTED, 'Unattended'],
    [INTERESTED, 'Active Prospect'],
    [FOLLOW_UP, 'Ongoing Contact'],
    [CALL_BACK,'Re-call'],
    [RNR_RING_NO_RESPONSE, 'Non-responsive'],
    [SWITCHED_OFF, 'Unavailable'],
    [BUSY,'Line Engaged'],
    [NOT_INTERESTED,'Disengaged Lead'],
    [NOT_WORKING_NOT_REACHABLE,'Inactive'],
    [NOT_POSSIBLE,'Ineligible'],
    [SCHEDULE_FOR_WALK_IN, 'Book Appointment'],
    [VERIFICATION_1, 'Preliminary Approval'],
    [SCHEDULE_CALL_WITH_MANAGER, 'Executive Consultation'],
    [TWELVE_DOCUMENTS_COLLECTED, "Documentation Collected"],
    [SCHEDULED_FOR_WALK_IN, 'Appointment Booked'],
    [APPROVED_FOR_WALK_IN, "Paperwork Verified"],
    [SCHEDULED_CALL_WITH_MANAGER, 'Advisor Consultation'],
    [OTHERS, OTHERS],
    [UNDER_REVIEW, UNDER_REVIEW],
    [ON_HOLD, "Application on Hold"],
    [MANAGER_1_APPROVED, "Stage 1 Approved"],
    [MANAGER_2_APPROVED, "Supervisor Approved"],
    [REJECTED, REJECTED],
    [NORMAL_LOGIN, NORMAL_LOGIN],
    [OKAY_FOR_POLICY, "Policy Confirmation"],
    [THINK_AND_GET_BACK, "Under Consideration"],
    [NOT_OKAY_FOR_POLICY, "Policy Declined"],
    [RESCHEDULE_WALK_IN, "Reschedule Appointment"],
    [RESCHEDULE_CALL_WITH_MANAGER, "Advisor Call Rescheduled"],
    [CLOSED, "Application Closed"],
    [LOGIN, LOGIN],
    [WALK_INS, "Appointments"],
    [LEADS, "Pipeline Entries"],
    [RESCHEDULED_FOR_WALK_IN, "Appointment Rescheduled"],
    [ALL_CLEAR,ALL_CLEAR],
    [NEGATIVE_TRANSACTION, NEGATIVE_TRANSACTION],
    [LOGIN_BANK_1, LOGIN_BANK_1],
  [LOGIN_BANK_2, LOGIN_BANK_2],
  [LOGIN_BANK_3, LOGIN_BANK_3],
  [LOGIN_BANK_4, LOGIN_BANK_4],
  [LOGIN_BANK_5, LOGIN_BANK_5],
  [LOGIN_BANK_6, LOGIN_BANK_6],
  [ALL_CLOSURE_DOCUMENTS_VERIFIED, ALL_CLOSURE_DOCUMENTS_VERIFIED],
  [ALL_LOGIN_DOCUMENTS_VERIFIED, ALL_LOGIN_DOCUMENTS_VERIFIED],
  [BUREAU_DISPUTE_RAISED, BUREAU_DISPUTE_RAISED],
  [ALL_DISPUTES_UPDATED, ALL_DISPUTES_UPDATED],
  [APPLICATION_APPROVED,APPLICATION_APPROVED],
  [CLOSING_DATE_CHANGED,CLOSING_DATE_CHANGED],
  [ADVANCE_AMOUNT_PAID,ADVANCE_AMOUNT_PAID],
  [CLOSING_AMOUNT_PAID,CLOSING_AMOUNT_PAID],
  [LOGIN_DATE_CHANGED,LOGIN_DATE_CHANGED],
  [APPOINTMENT_CANCELLED, APPOINTMENT_CANCELLED],
  [APPOINTMENT_COMPLETED, APPOINTMENT_COMPLETED],
  [APPOINTMENT_PENDING, APPOINTMENT_PENDING],
  [APPOINTMENT_RESCHEDULED,APPOINTMENT_RESCHEDULED],
  [ADVISOR_CONSULTATION_PENDING,ADVISOR_CONSULTATION_PENDING],
  [ADVISOR_CONSULTATION_CANCELLED,ADVISOR_CONSULTATION_CANCELLED],
  [ADVISOR_CONSULTATION_COMPLETED,ADVISOR_CONSULTATION_COMPLETED],
  [ADVISOR_CONSULTATION_RESCHEDULED,ADVISOR_CONSULTATION_RESCHEDULED],
  [MAKER_APPROVED, MAKER_APPROVED],
  [CHECKER_APPROVED, CHECKER_APPROVED],
  [START_LOGIN,START_LOGIN],
  [UNDER_PROCESS,UNDER_PROCESS],
  [DISBURSED_FROM_BANKS,DISBURSED_FROM_BANKS],
  [APPLICATION_IS_CLOSED,APPLICATION_IS_CLOSED],
  [OTHERS,OTHERS],
  [SEND_TO_LOGIN,SEND_TO_LOGIN],
  [APPLICATION_ON_HOLD,APPLICATION_ON_HOLD]
  ])

const ACTIVITY_LOGS = {
    ASSIGN_LEAD : (leadId, assignedTo, assignedBy) =>
    `Lead ID ${leadId} assigned to ${assignedTo} by ${assignedBy}`,
    LEAD_ASSIGNMENT : (employeeName) => `Lead Assigned to ${employeeName}`,
    APPLICATION_STATUS_UPDATE: (newStatus) => `Application status updated to ${terminologiesMap.get(newStatus)}`,
    LEAD_STATUS_UPDATE: (prevStatus, newStatus, verification_date) => 
        `Lead status updated from ${terminologiesMap.get(prevStatus)} to ${terminologiesMap.get(newStatus)}${
          [ALL_CLEAR, NEGATIVE_TRANSACTION].includes(terminologiesMap.get(newStatus)) ? ` (Verification Date: ${verification_date})` : ''
        }`,      
    TASK_CREATE : (task_type, task_date) => `${terminologiesMap.get(task_type)} on ${task_date}`,
    PAYSLIP_UPLOAD : (document_name) => `Payslip ${document_name} uplaoded`,
    CREDIT_BUREAU_UPLOAD : (document_name) => `Credit Bureau ${document_name} uploaded`,
    NAME_UPDATE : 'Name updated',
    EMAIL_UPDATE : 'Email updated',
    CITY_UPDATE : 'City updated',
    SALARY_UPDATE : 'Salary updated',
    COMPANY_UPDATE : 'Company updated',
    COMPANY_CATEGORY_UPDATE : 'Company Category updated',
    LOAN_REPORTS_UPDATE : (loan_type, bank_name, loan_amount, emi, emi_date, outstanding) => `Loan Report Uploaded ( Loan Type : ${loan_type}, Bank Name : ${bank_name}, Loan Amount : ${loan_amount}, EMI : ${emi}, EMI Date : ${emi_date}, Outstanding : ${outstanding} )`,
    CREDIT_REPORTS_UPDATE : (credit_card_name, total_outstanding) => `Credit Card Report Uploaded ( Credit Card Name : ${credit_card_name}, Total Outstanding : ${total_outstanding})`,
    LOAN_REPORT_DELETE : (loan_type, bank_name, loan_amount, emi, emi_date, outstanding) => `Loan Report Deleted ( Loan Type : ${loan_type}, Bank Name : ${bank_name}, Loan Amount : ${loan_amount}, EMI : ${emi}, EMI Date : ${emi_date}, Outstanding : ${outstanding} )`,
    CREDIT_REPORT_DELETE : (credit_card_name, total_outstanding) => `Credit Card Report Deleted ( Credit Card Name : ${credit_card_name}, Total Outstanding : ${total_outstanding})`,
    WALK_IN_SCHEDULE : (date) => `Appointment scheduled on ${date}`,
    WALK_IN_RESCHEDULE : (date) => `Appointment rescheduled on ${date}`,
    TASK_UPDATE : (task_type,task_status) => `Task ${terminologiesMap.get(task_type)} is updated to ${task_status}`,
    WALK_IN_UPDATE : (new_status) => `Appointment status updated to ${new_status}`,
    PAYSLIP_DELETE : (document_name) => `Payslip ${document_name} deleted`,
    OTHER_DOC_UPLOAD : (document_name) => `Other Doc ${document_name} uploaded`,
    CLOSING_DOC_UPLOAD: (document_name) => `Closing Doc ${document_name} uploaded`,
    CLOSING_DOC_DELETE: (document_name) => `Closing Doc ${document_name} deleted`,
    OTHER_DOC_DELETE : (document_name) => `Other Doc ${document_name} deleted`,
    CREDIT_BUREAU_DELETE : (document_name) => `Credit Bureau ${document_name} deleted`,
    DOCUMENTS_COLLECTED :  (docs_collected) => `Documents collected ( Marked as ${docs_collected ? 'YES' : 'NO'} )`,
    CALL_SCHEDULE_WITH_MANAGER : (date) => `Advisor consultation scheduled on ${date}`,
    RESCHEDULE_CALL_WITH_MANAGER : (date) => `Advisor consultation re-scheduled on ${date}`,
    ADD_ACTIVITY_LOG_NOTE : `Note Added`,
    LEAD_SOURCE_UPDATE : 'Lead Source Updated',
    BEREAU_NAME_UPDATE : 'Bereau Name Updated',
    BEREAU_SCORE_UPDATE : 'Bereau Score Updated',
    LEAD_UPDATE: 'Lead Details Updated',
    LOAN_REPORT_ADD: (loan_type, bank_name, loan_amount, emi, outstanding, emi_date, loan_disbursal_date) => `Loan Report Uploaded ( Loan Type : ${loan_type}, Bank Name : ${bank_name}, Loan Amount : ${loan_amount}, EMI : ${emi}, Outstanding : ${outstanding}, EMI Date : ${emi_date}, Loan Disbursal Date : ${loan_disbursal_date} )`,
    CREDIT_REPORT_ADD : (credit_card_name, total_outstanding, card_limit) => `Credit Report Added ( Credit Card Name : ${credit_card_name}, Total Outstanding : ${total_outstanding}), Card Limit : ${card_limit}`,
    VERIFICATION_STATUS_UPDATE: (verification_status) => `Updated Verification Status to : ${terminologiesMap.get(verification_status)}`,
    LOGIN_DELETE: (login_id, bank_name, application_number, login_date, disbursal_date, dsa_name, login_status) => `Login Deleted ( Login ID : ${login_id}, Bank Name : ${bank_name}, Application No : ${application_number}, Login Date : ${login_date}, Disbursal Date : ${disbursal_date}, DSA Name : ${dsa_name}, Login Status : ${login_status})`,
    LOGIN_ADD: (
  bank_name,
  dsa_name,
  application_number,
  login_date,
  scheme,
  login_amount,
  login_status,
  sanction_date,
  sanction_amount,
  disbursal_date,
  disbursal_amount,
  note
) => {
  const fields = [
    ["Bank Name", bank_name],
    ["DSA Name", dsa_name],
    ["Application No", application_number],
    ["Login Date", login_date],
    ["Scheme", scheme],
    ["Login Amount", login_amount],
    ["Login Status", login_status],
    ["Sanction Date", sanction_date],
    ["Sanction Amount", sanction_amount],
    ["Disbursal Date", disbursal_date],
    ["Disbursal Amount", disbursal_amount],
    ["Note", note]
  ];

  const message = fields
    .filter(([, value]) => !!value) // only truthy values
    .map(([key, value]) => `${key} : ${value}`)
    .join(", ");

  return `Login Added (${message})`;
}
}

module.exports = {
    ACTIVITY_LOGS,
    ACTIVITY_TYPES,
    terminologiesMap  
}