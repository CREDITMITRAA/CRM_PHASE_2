const { sequelize } = require("../models")
const { createLogData, createActivityLog } = require("../services/ActivityLogServices")
const RuleEngineServices = require("../services/RuleEngineServices")
const LeadServices = require("../services/leadServices")
const ActivityLogServices = require("../services/ActivityLogServices")
const { ACTIVITY_LOGS, ACTIVITY_TYPES } = require("../utilities/ActivityLogConstants")
const { ApiResponse } = require("../utilities/api-responses/ApiResponse")

async function runRuleEngine(req, res) {
    const transaction = await sequelize.transaction()
    try {
        const { leadId, userId } = req.body
        if (!leadId || !userId) {
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        // get lead by leadId
        const lead = await LeadServices.getLead(leadId, transaction)
        if (!lead) {
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Lead not found !")
        }

        // Get the latest status from activity logs using service method
        const latestActivityLog = await ActivityLogServices.getRecentActivityLogByLeadIdAndActivityType(
            leadId, 
            ACTIVITY_TYPES.LEAD_STATUS_UPDATE
        );

        let previousStatus = "Not Contacted"; // Default to current status

        // If we found an activity log, extract the previous status from the description
        if (latestActivityLog) {
            // Parse the activity description to get previous status
            // Example: "Lead status updated from Ineligible to Not met criteria - Does not meet score card criteria"
            const activityDesc = latestActivityLog.activity_desc;
            const fromMatch = activityDesc.match(/from (.+?) to/);
            if (fromMatch) {
                previousStatus = fromMatch[1].trim();
            }
        }

        // check for required fields to run rule engine
        const missingFields = RuleEngineServices.getMissingMandatoryFields(lead)
        if (missingFields.length > 0) {
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, `Missing mandatory fields - ${missingFields.join(', ')}`, {
                lead: lead.get({ plain: true }), // Convert to plain object
                missingFields
            })
        }

        const passesScoreCard = RuleEngineServices.runFirstLevelScoreCardCriteria(lead)
        if (!passesScoreCard) {
            const failureReason = RuleEngineServices.getScoreCardFailureReason(lead)
            const autoRejectDescription = `Auto-rejected: ${failureReason}`

            const updatePayload = {
                lead_status: "Not met criteria",
                last_updated_status: "Not met criteria",
                is_eligibility_criteria_checked: true,
                sub_status: failureReason,
                updatedAt: new Date().toISOString()
            }

            await lead.update(updatePayload, { transaction })
            
            // create activity log
            const logData = createLogData(
                ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                    previousStatus, // Use the status from activity log
                    "Not met criteria",
                    null,
                    failureReason
                ),
                ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
                userId,
                leadId,
                autoRejectDescription,
                lead.name
            )
            await createActivityLog(logData, transaction)

            // Use the updated lead instance
            await lead.reload({ transaction })

            await transaction.commit()

            return ApiResponse(
                res,
                "ERROR",
                400,
                autoRejectDescription,
                {
                    lead: lead.get({ plain: true }), // Convert to plain object for response
                    failureReason: failureReason,
                    meetsCriteria: false
                }
            )
        }

        // When criteria matches - update lead status to previous status from activity log
        const successDescription = `Meets score card criteria - Status auto updated to ${previousStatus}`
        
        // Update lead with previous status from activity log
        const updatePayload = {
            lead_status: previousStatus, // Use previous status from activity log
            last_updated_status: previousStatus,
            is_eligibility_criteria_checked: true,
            sub_status: null,
            updatedAt: new Date().toISOString()
        }

        const currentStatusBeforeUpdate = lead.lead_status;

        await lead.update(updatePayload, { transaction })
        
        // create activity log for successful criteria match
        const logData = createLogData(
            ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                currentStatusBeforeUpdate, // Current status before the update
                previousStatus, // New status (from activity log)
                null
            ),
            ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
            userId,
            leadId,
            successDescription,
            lead.name
        )
        await createActivityLog(logData, transaction)

        await lead.reload({ transaction })
        await transaction.commit()

        return ApiResponse(res, "SUCCESS", 200, successDescription, {
            lead: lead.get({ plain: true }),
            meetsCriteria: true
        })

    } catch (error) {
        await transaction.rollback()
        console.log("Failed to run rule engine = ", error);
        return ApiResponse(res, "ERROR", 500, error?.message || "Failed to run rule engine !", null, error)
    }
}

module.exports = {
    runRuleEngine
}