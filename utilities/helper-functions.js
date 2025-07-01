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
          "dispute_status",
          "dispute_date"
        ]
      : ["credit_card_name", "total_outstanding", "loan_status", "closing_date", "dispute_status", "dispute_date"];

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return !isNaN(date) ? date.toISOString().split("T")[0] : value;
  };

  let log =
    reportType === "LOAN"
      ? "Loan report updated:\n"
      : "Credit report updated:\n";

  fieldsToCheck.forEach((field) => {
    let oldVal = oldData[field];
    let newVal = newData[field];

    // If it's a date field, format it
    if (["emi_date", "loan_disbursal_date"].includes(field)) {
      oldVal = formatDate(oldVal);
      newVal = formatDate(newVal);
    }

    if (String(oldVal) !== String(newVal)) {
      log += `& ${field}: "${oldVal}" → "${newVal}"\n`;
    }
  });

  return log.trim(); // remove trailing newline
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

module.exports = {
  toUTCFormat,
  getErrorReason,
  getUpdatedFields,
  getActivityType,
  formatString,
  generateLoanOrCreditReportChangeLog,
  generateApiCredentials,
  generatePartnerCode
};
