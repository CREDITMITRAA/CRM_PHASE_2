function runFirstLevelScoreCardCriteria(lead) {
  const salary = parseFloat(lead.salary);
  const companyCategory = lead.company_category;
  
  // 1. Age criteria - 21 to 55 years
  if (!meetsAgeCriteria(lead.date_of_birth)) {
    return false;
  }
  
  // 2. Salary above 25,000 (Super CATA, CATA & CATB)
  if (["Super CAT", "CAT A", "CAT B"].includes(companyCategory)) {
    return salary > 25000;
  }
  
  // 3. Salary above 50,000 for CATC and salary above 75,000 for CATD
  if (companyCategory === "CAT C") {
    return salary > 50000;
  }
  
  if (companyCategory === "CAT D") {
    return salary > 75000;
  }
  
  // If company category doesn't match any known categories, return false
  return false;
}

function getScoreCardFailureReason(lead) {
  const salary = parseFloat(lead.salary);
  const companyCategory = lead.company_category;
  
  // Check age criteria first
  if (!meetsAgeCriteria(lead.date_of_birth)) {
    return getAgeFailureReason(lead.date_of_birth);
  }
  
  if (!companyCategory) {
    return "Company category not specified";
  }
  
  if (["Super CAT", "CAT A", "CAT B"].includes(companyCategory)) {
    if (salary <= 25000) {
      return `Salary (${salary}) is below minimum requirement of 25,000 for ${companyCategory}`;
    }
  }
  
  if (companyCategory === "CAT C" && salary <= 50000) {
    return `Salary (${salary}) is below minimum requirement of 50,000 for CAT C`;
  }
  
  if (companyCategory === "CAT D" && salary <= 75000) {
    return `Salary (${salary}) is below minimum requirement of 75,000 for CAT D`;
  }
  
  return `Does not meet score card criteria for ${companyCategory}`;
}

function getMissingMandatoryFields(lead) {
  const mandatoryFields = ['company', 'city', 'salary', 'company_category', 'income_type', 'pan', 'date_of_birth'];
  const missingFields = [];
  
  mandatoryFields.forEach(field => {
    const value = lead?.[field];
    if (value == null || value === '' || String(value).trim() === '') {
      missingFields.push(field);
    }
  });
  
  return missingFields;
}

// Helper function to calculate age from date of birth
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  
  const dob = new Date(dateOfBirth);
  const today = new Date();
  
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  // Adjust age if birthday hasn't occurred this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
}

// Function to check if age meets criteria (21-55 years)
function meetsAgeCriteria(dateOfBirth) {
  const age = calculateAge(dateOfBirth);
  return age !== null && age >= 21 && age <= 55;
}

// Function to get detailed age criteria failure reason
function getAgeFailureReason(dateOfBirth) {
  if (!dateOfBirth) {
    return "Date of birth not specified";
  }
  
  const age = calculateAge(dateOfBirth);
  
  if (age === null) {
    return "Invalid date of birth";
  }
  
  if (age < 21) {
    return `Age (${age}) is below minimum requirement of 21 years`;
  }
  
  if (age > 55) {
    return `Age (${age}) is above maximum limit of 55 years`;
  }
  
  return "";
}

module.exports = {
    runFirstLevelScoreCardCriteria,
    getScoreCardFailureReason,
    getMissingMandatoryFields,
    calculateAge,
    meetsAgeCriteria,
    getAgeFailureReason
}