const { Lead } = require("../models");

async function updateLead(leadId, leadData, transaction) {
  if (!leadId) {
    throw new Error("Lead ID is required to update the lead.");
  }
  const lead = await Lead.findByPk(leadId, { transaction });
  if (!lead) {
    throw new Error(`Lead with ID ${leadId} not found.`);
  }
  await lead.update(leadData, { transaction });
  return lead; // Return the updated lead
}

async function getLead(leadId,transaction){
  if (!leadId) {
    throw new Error("Lead ID is required to update the lead.");
  }
  const lead = await Lead.findByPk(leadId, {transaction});
  return lead
}

async function getLeadByPhone(phone, transaction = null) {
  if (!phone) {
    throw new Error("Phone is required to fetch the lead");
  }

  // Primary phone
  let lead = await Lead.findOne({
    where: { phone },
    attributes: ["id", "name"],
    raw: true,
    ...(transaction && { transaction })
  });

  if (!lead) {
    // Check in alternate_phones JSON (ARRAY_CONTAINS)
    lead = await Lead.findOne({
      where: sequelize.literal(`JSON_CONTAINS(alternate_phones, '"${phone}"')`),
      attributes: ["id", "name"],
      raw: true,
      ...(transaction && { transaction })
    });
  }

  return lead;
}

module.exports = {
  updateLead,
  getLead,
  getLeadByPhone
};
