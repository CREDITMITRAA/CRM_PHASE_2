const INITIAL_LEAD_STATUSES = [
    "Not Contacted",
    'Interested',
    "Follow Up",
    "Call Back",
    "RNR ( Ring No Response )",
    "Switched Off",
    "Busy",
    "Not Interested",
    "Not Working / Not Reachable",
    "Message",
    "Email",
    "Not Possible",
    "Scheduled Call With Manager",
    "Others",
    "Re Engaged"
]

const  LEAD_STATUSES = [
    "Not Contacted",
    'Interested',
    "Follow Up",
    "Call Back",
    "RNR ( Ring No Response )",
    "Switched Off",
    "Busy",
    "Not Interested",
    "Not Working / Not Reachable",
    "Message",
    "Email",
    "Verification 1",
    "Scheduled For Walk-In",
    "Okay for Policy",
    "Think and get back",
    "12 documents collected",
    "Not okay for Policy",
    "Not Possible",
    "Scheduled Call With Manager",
    "Others",
    "All Positive",
    "Negative Observations",
    "All Loans Closed",
    "All Closure Documents Verified",
    "All Login Documents Verified",
    "Bureau Dispute Raised",
    "All Disputes Updated",
    "Login Bank 1",
    "Login Bank 2",
    "Login Bank 3",
    "Login Bank 4",
    "Login Bank 5",
    "Login Bank 6",
    "All Clear",
    "Negative Transaction",
    "Re-Scheduled Call With Manager",
    "Re-Scheduled For Walk-In",
    "Appointment Pending",
    "Appointment Cancelled",
    "Appointment Completed",
    "Appointment Rescheduled",
    "Advisor Consultation Pending",
    "Advisor Consultation Cancelled",
    "Advisor Consultation Completed",
    "Advisor Consultation Rescheduled",
    "Closed",
    "Not met criteria"       
]

const VERIFICATION_STATUSES = [
    "Scheduled For Walk-In",
    "Verification 1",
    "Under Review",
    "On Hold",
    "Manager 1 Approved",
    "Manager 2 Approved",
    "Approved for Walk-In",
    "Rejected",
    "Normal Login",
    "Scheduled Call With Manager",
    "Send To Login",
    "Others"
]

const TASK_STATUSES = [
    "Upcoming",
    "Pending",
    "Completed"
]

const ROLE_ADMIN = "ROLE_ADMIN"
const ROLE_EMPLOYEE = "ROLE_EMPLOYEE"
const ROLE_MANAGER = "ROLE_MANAGER"
const ROLE_OPERATIONS_TEAM = "OPERATIONS_TEAM";
const ROLE_VIEWER = "ROLE_VIEWER"
const LOGINS = "LOGINS"
const REJECTED = "Rejected"
const NORMAL_LOGIN = "Normal Login"
const PAID = "Paid"
const LOGIN_BANK_1 = "Login Bank 1"
const LOGIN_BANK_2 = "Login Bank 2"
const LOGIN_BANK_3 = "Login Bank 3"
const LOGIN_BANK_4 = "Login Bank 4"
const LOGIN_BANK_5 = "Login Bank 5"
const LOGIN_BANK_6 = "Login Bank 6"
const UNDER_PROCESS = "Under Process"
const START_LOGIN = "Start Login"
const DISBURSED_FROM_BANKS = "Disbursed from Banks"
const APPLICATION_IS_CLOSED = "Application Closed";
const OTHERS = "Others"
const PIPELINE_ENTRIES = "PIPELINE_ENTRIES"
const PRELIMINERY_CHECK = "PRELIMINERY_CHECK"
const APPOINTMENTS = "APPOINTMENTS"
const APPROVED_APPLICATIONS = "APPROVED_APPLICATIONS"
const ALL_DISPUTES_UPDATED = "All Disputes Updated";
const ALL_CLEAR = "All Clear"
const DISPUTE_UPDATED = "Dispute Updated"
const TASK_REMINDER = "Task Reminder"

const WALK_IN_STATUSES = [
    "Upcoming",
    "Pending",
    "Rescheduled",
    "Completed",
    "Cancelled"
]

const APPLICATION_STATUSES = [
    "Scheduled For Walk-In",
    "Manager 1 Approved",
    "Manager 2 Approved",
    "Rejected",
    "Closed",
    "Login",
    "Normal Login",
    "Application Approved",
    "Advance Amount Paid",
    "Closing Date Changed",
    "Closing Amount Paid",
    "Loans Disbursed From Bank",
    "Application Closed",
    "Others",
    "Login Started",
    "Login Date Changed",
    "Maker Approved",
    "Checker Approved",
    "Send To Login",
    "Under Process",
    "Application On Hold",
    "Disbursed From Banks",
    "Start Login"
]

const CRM_BUCKETS = [
    "PIPELINE_ENTRIES",
    "PRELIMINERY_CHECK",
    "APPOINTMENTS",
    "APPROVED_APPLICATIONS",
    "LOGINS"
]

const LEAD_AGGREGATOR = "LEAD_AGGREGATOR"
const CONNECTOR = "CONNECTOR"

const CLOSING_LOAN_STATUSES = [
    "Loan Closed",
    "Dispute Raised",
    "Dispute Updated"
]

const LOAN_STATUS_OPTIONS = [
    "Closed",
    "Not Closing",
    "Others"
]

const DISPUTE_STATUS_OPTIONS = [
    "Dispute Raised",
    "Dispute Updated",
    "Others"
]

const LOGIN_STATUS_OPTIONS = [
    "Sent For Login",
    "Login",
    "Hold",
    "In Progress",
    "Sanctioned",
    "Rejected",
    "Rework",
    "Disbursed",
    "Others",
]

const LOGIN_SCHEME_OPTIONS = [
    "Fresh",
    "Top Up",
    "Parallel",
    "BT"
]

const callTypes = {
    OUTGOING: "OUTGOING",
    INCOMING: "INCOMING",
    MISSED: "MISSED"
}

const callStatuses = {
    ANSWERED: "ANSWERED",
    NOT_ANSWERED: "NOT_ANSWERED"
}

const leadBuckets = {
    PIPELINE_ENTRIES,
    PRELIMINERY_CHECK,
    APPOINTMENTS,
    APPROVED_APPLICATIONS,
    LOGINS
}

module.exports = {
    LEAD_STATUSES,
    VERIFICATION_STATUSES,
    ROLE_ADMIN,
    ROLE_EMPLOYEE,
    ROLE_MANAGER,
    ROLE_OPERATIONS_TEAM,
    ROLE_VIEWER,
    TASK_STATUSES,
    WALK_IN_STATUSES,
    APPLICATION_STATUSES,
    INITIAL_LEAD_STATUSES,
    CRM_BUCKETS,
    LEAD_AGGREGATOR,
    CONNECTOR,
    CLOSING_LOAN_STATUSES,
    LOAN_STATUS_OPTIONS,
    DISPUTE_STATUS_OPTIONS,
    LOGIN_STATUS_OPTIONS,
    LOGINS,
    NORMAL_LOGIN,
    PAID,
    LOGIN_BANK_1,
    LOGIN_BANK_2,
    LOGIN_BANK_3,
    LOGIN_BANK_4,
    LOGIN_BANK_5,
    LOGIN_BANK_6,
    UNDER_PROCESS,
    START_LOGIN,
    DISBURSED_FROM_BANKS,
    APPLICATION_IS_CLOSED,
    OTHERS,
    LOGIN_SCHEME_OPTIONS,
    PIPELINE_ENTRIES,
    REJECTED,
    ALL_DISPUTES_UPDATED,
    ALL_CLEAR,
    DISPUTE_UPDATED,
    TASK_REMINDER,
    callTypes,
    callStatuses,
    leadBuckets
}
