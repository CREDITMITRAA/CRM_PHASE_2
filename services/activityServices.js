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

module.exports = {
    addActivity,
    updateDocsCollectedByActivityId,
}
