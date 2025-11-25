function runFirstLevelScoreCardCriteria(lead) {
  const salary = parseFloat(lead.salary);
  const companyCategory = lead.company_category;
  
  // 1. Age criteria - 21 to 55 years
  // if (!meetsAgeCriteria(lead.date_of_birth)) {
  //   return false;
  // }
  
  // 2. Salary above 25,000 (Super CATA, CATA & CATB)
  if (["SUPER CAT", "CAT A", "CAT B"].includes(companyCategory)) {
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
  // if (!meetsAgeCriteria(lead.date_of_birth)) {
  //   return getAgeFailureReason(lead.date_of_birth);
  // }
  
  if (!companyCategory) {
    return "Company category not specified";
  }
  
  if (["SUPER CAT", "CAT A", "CAT B"].includes(companyCategory)) {
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
  const mandatoryFields = ['company', 'city', 'salary', 'company_category', 'income_type', 'pan'];
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

// Helper function to calculate age from DOB string (DD-MM-YYYY format)
function calculateAgeFromDOBString(dobString) {
  if (!dobString) return null;
  
  // Try to match DD-MM-YYYY format
  const dobMatch = dobString.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (dobMatch) {
    const [, day, month, year] = dobMatch;
    const dobDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const today = new Date();
    
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
      age--;
    }
    
    return age;
  }
  
  // Try to match "X years" format
  const ageMatch = dobString.match(/(\d+)\s*years/);
  if (ageMatch) {
    return parseInt(ageMatch[1], 10);
  }
  
  return null;
}

// Function to run credit report rule engine
// Returns: { status: 'APPROVED' | 'REJECTED', messages: [] }
function runCreditReportRuleEngine(dob, repaymentHistory) {
  const results = [];
  
  // Criterion 1: Age criteria - must be between 21 and 55 years
  if (dob) {
    const age = calculateAgeFromDOBString(dob);
    
    if (age === null) {
      results.push("Rejected: Invalid date of birth format");
    } else if (age < 21 || age > 55) {
      results.push(`Rejected: Age is ${age} years (must be between 21 and 55 years)`);
    }
  }
  
  // Get the repayment history array (handle both object and array structures)
  const historyData = repaymentHistory || [];
  
  if (!Array.isArray(historyData) || historyData.length === 0) {
    // If no repayment history provided, we might want to approve or reject based on business logic
    // For now, we'll skip the repayment checks if no data is provided
  } else {
    // Criterion 2: Check if 90+ DPDs count >= 10
    const totalPeriod = historyData.find(
      (item) => item.repayment_duration === "total"
    );
    
    if (totalPeriod) {
      const total90Plus = totalPeriod["90+"] || 0;
      
      if (total90Plus >= 10) {
        results.push(`Rejected: 90+ DPDs count is ${total90Plus} (>= 10)`);
      }
    }
    
    // Criterion 3: For 0_12_months duration, if 30+ DPDs > 6, show rejected
    const period0To12Months = historyData.find(
      (item) => item.repayment_duration === "0_12_months"
    );
    
    if (period0To12Months) {
      // Sum of 30+, 60+, and 90+ DPDs
      const dpd30Plus = (period0To12Months["30+"] || 0) + 
                       (period0To12Months["60+"] || 0) + 
                       (period0To12Months["90+"] || 0);
      
      if (dpd30Plus > 6) {
        results.push(`Rejected: 0-12 months duration has 30+ DPDs count of ${dpd30Plus} (> 6)`);
      }
    }
    
    // Criterion 4: Combined 0-3 months and 0-6 months durations, if combined DPDs total >= 1, show rejected
    // Extract 0_3_months and 0_6_months from the main repaymentHistory array
    const period0To3Months = historyData.find(
      (item) => item.repayment_duration === "0_3_months"
    );
    const period0To6Months = historyData.find(
      (item) => item.repayment_duration === "0_6_months"
    );
    
    // Build array of periods to check
    const periodsToCheck = [];
    if (period0To3Months) periodsToCheck.push(period0To3Months);
    if (period0To6Months) periodsToCheck.push(period0To6Months);
    
    if (periodsToCheck.length > 0) {
      let combinedDpdTotal = 0;
      
      periodsToCheck.forEach((period) => {
        // Sum of all DPD buckets (90+, 60+, 30+, 0-30) for each period
        const dpdTotal = (period["90+"] || 0) + 
                        (period["60+"] || 0) + 
                        (period["30+"] || 0) + 
                        (period["0-30"] || 0);
        combinedDpdTotal += dpdTotal;
      });
      
      if (combinedDpdTotal >= 1) {
        results.push(`Rejected: Combined 0-3 months and 0-6 months duration has DPDs total of ${combinedDpdTotal} (>= 1)`);
      }
    }
  }
  
  // Return result
  if (results.length > 0) {
    return {
      status: "REJECTED",
      messages: results
    };
  } else {
    return {
      status: "APPROVED",
      messages: ["All criteria passed. Application approved."]
    };
  }
}

module.exports = {
    runFirstLevelScoreCardCriteria,
    getScoreCardFailureReason,
    getMissingMandatoryFields,
    calculateAge,
    meetsAgeCriteria,
    getAgeFailureReason,
    runCreditReportRuleEngine,
    calculateAgeFromDOBString
}