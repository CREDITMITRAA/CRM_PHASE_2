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

function getErrorReason(error) {
    // Check for specific error types and extract relevant messages
    if (error.name === 'SequelizeValidationError') {
      // Validation errors: Get specific error messages from the validation errors
      return error.errors.map(err => err.message).join(', ');
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      // Unique constraint violation
      if (Array.isArray(error.fields)) {
        return `Unique constraint violation on ${error.fields.join(', ')}`;
      }
      return `Unique constraint violation occurred.`;
    }
    // Default case for other types of errors
    return error.message || 'Unknown database error';
  }

module.exports = {
  toUTCFormat,
  getErrorReason
};
