const { ACTIVITY_TYPES } = require("./ActivityLogConstants");
const crypto = require("crypto");
const { LEAD_AGGREGATOR } = require("./constants");
const { LeadPartner } = require("../models");

function toUTCFormat(dateString, timeString = "00:00:00") {
  // Combine date and time strings
  const fullDateTime = `${dateString}T${timeString}Z`;
  // Create a Date object
  const date = new Date(fullDateTime);

  // Format date and time in UTC
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Months are 0-based
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  // Return formatted UTC string
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getErrorReason(err) {
  if (!err) return "Unknown error";

  if (err.name === "SequelizeUniqueConstraintError") {
    const field = err?.errors?.[0]?.path || "unknown field";
    return `Duplicate entry violates unique constraint on '${field}'`;
  }

  if (err.name === "SequelizeValidationError") {
    return err.errors.map((e) => `${e.path}: ${e.message}`).join(", ");
  }

  if (err.original && err.original.sqlMessage) {
    return err.original.sqlMessage;
  }

  if (typeof err.message === "string") {
    return err.message;
  }

  return JSON.stringify(err);
}

function getUpdatedFields(oldLead, newLead) {
  let updatedFields = {};

  Object.keys(newLead).forEach((key) => {
    if (
      oldLead[key] !== newLead[key] &&
      !(oldLead[key] == null && newLead[key] == "") // Handle null vs empty string equivalence
    ) {
      updatedFields[key] = {
        newValue: oldLead[key],
        oldValue: newLead[key],
      };
    }
  });

  return updatedFields;
}

function getActivityType(keyName) {
  switch (keyName) {
    case "name":
      return ACTIVITY_TYPES.NAME_UPDATE;
    case "email":
      return ACTIVITY_TYPES.EMAIL_UPDATE;
    case "city":
      return ACTIVITY_TYPES.CITY_UPDATE;
    case "salary":
      return ACTIVITY_TYPES.SALARY_UPDATE;
    case "company":
      return ACTIVITY_TYPES.COMPANY_UPDATE;
    case "company_category_name":
      return ACTIVITY_TYPES.COMPANY_CATEGORY_UPDATE;
    case "lead_source":
      return ACTIVITY_TYPES.LEAD_SOURCE_UPDATE;
    case "bereau_name":
      return ACTIVITY_TYPES.BEREAU_NAME_UPDATE;
    case "bereau_score":
      return ACTIVITY_TYPES.BEREAU_SCORE_UPDATE;
  }
}

function formatString(str) {
  return str
    .replace(/_/g, " ") // Replace underscores with spaces
    .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize the first letter of each word
}

function generateLoanOrCreditReportChangeLog(oldData, newData, reportType) {
  const fieldsToCheck =
    reportType === "LOAN"
      ? [
          "loan_type",
          "loan_amount",
          "bank_name",
          "emi",
          "outstanding",
          "emi_date",
          "loan_disbursal_date",
          "loan_status",
          "closing_date",
          "closing_document_url",
          "dispute_status",
          "dispute_date"
        ]
      : [
          "credit_card_name",
          "total_outstanding",
          "card_limit",
          "loan_status",
          "closing_date",
          "dispute_status",
          "dispute_date",
          "closing_document_url"
        ];

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return !isNaN(date) ? date.toISOString().split("T")[0] : value;
  };

  const changes = fieldsToCheck
    .filter(field => {
      let oldVal = oldData[field];
      let newVal = newData[field];

      // Format date fields if needed
      if (field.includes('date') || field === 'emi_date' || field === 'loan_disbursal_date') {
        oldVal = formatDate(oldVal);
        newVal = formatDate(newVal);
      }

      return String(oldVal) !== String(newVal);
    })
    .map(field => {
      let oldVal = oldData[field];
      let newVal = newData[field];

      // Format date fields if needed
      if (field.includes('date') || field === 'emi_date' || field === 'loan_disbursal_date') {
        oldVal = formatDate(oldVal);
        newVal = formatDate(newVal);
      }

      return `${field}: "${oldVal}" → "${newVal}"`;
    });

  const prefix = reportType === "LOAN" 
    ? "Loan report updated: " 
    : "Credit report updated: ";

  return changes.length > 0
    ? prefix + changes.join(" & ")
    : prefix + "No changes detected";
}

function generateApiCredentials() {
  const api_key = crypto.randomBytes(16).toString("hex");
  const api_secret = crypto.randomBytes(32).toString("hex");
  return { api_key, api_secret };
}

async function generatePartnerCode(type) {
  const prefix = type === LEAD_AGGREGATOR ? "LA" : "CN";

  const count = await LeadPartner.count({ where: { lead_partner_type: type } });
  const serial = String(count + 1).padStart(4, "0");

  return `${prefix}${serial}`;
}

function generateLoginDetailChangeLog(oldData, newData) {
  const fieldsToCheck = [
        "bank_name",
        "dsa_name",
        "application_number",
        "login_date",
        "scheme",
        "login_amount",
        "login_status",
        "sanction_date",
        "sanction_amount",
        "disbursal_date",
        "disbursal_amount",
        "note",
  ];

  const changes = fieldsToCheck
    .filter(field => String(oldData[field]) !== String(newData[field]))
    .map(field => `${field}: "${oldData[field]}" → "${newData[field]}"`);

  return changes.length > 0 
    ? `Login Detail Updated : ${changes.join(" & ")}`
    : ""; // or return empty string if no changes
}

module.exports = {
  toUTCFormat,
  getErrorReason,
  getUpdatedFields,
  getActivityType,
  formatString,
  generateLoanOrCreditReportChangeLog,
  generateApiCredentials,
  generatePartnerCode,
  generateLoginDetailChangeLog,
};
