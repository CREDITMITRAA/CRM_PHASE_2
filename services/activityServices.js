const { Activity } = require("../models");

async function addActivity(activityData, transaction) {
  const createdActivity = await Activity.create(
    { ...activityData },
    { transaction }
  );
  return createdActivity; // Return the created activity
}

async function updateDocsCollectedByActivityId(data, transaction){
  const {docs_collected, activity_id, user_id, lead_id} = data
  if(typeof docs_collected === 'undefined' || !activity_id || !user_id || !lead_id){
      throw new Error("Missing required fields !")
  }

  const [updatedCount] = await Activity.update(
    {docs_collected},
    {where : {id:activity_id}, transaction}
  )

  if(updatedCount === 0){
    throw new Error('Activity Not Found or No Changes Made !')
  }
}

function runFirstLevelScoreCardCriteria(lead) {
  const salary = parseFloat(lead.salary);
  const companyCategory = lead.company_category;
  
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
  
  if (!companyCategory) {
    return "Company category not specified";
  }
  
  if (["Super CAT", "CAT A", "CAT B"].includes(companyCategory)) {
    return `Salary (${salary}) is below minimum requirement of 25,000 for ${companyCategory}`;
  }
  
  if (companyCategory === "CAT C" && salary <= 50000) {
    return `Salary (${salary}) is below minimum requirement of 50,000 for CAT C`;
  }
  
  if (companyCategory === "CAT D" && salary <= 75000) {
    return `Salary (${salary}) is below minimum requirement of 75,000 for CAT D`;
  }
  
  return "Does not meet score card criteria";
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

module.exports = {
    addActivity,
    updateDocsCollectedByActivityId,
    runFirstLevelScoreCardCriteria,
    getScoreCardFailureReason,
    getMissingMandatoryFields
}
