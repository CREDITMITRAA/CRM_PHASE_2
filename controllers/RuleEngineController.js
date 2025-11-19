const { sequelize } = require("../models")
const { createLogData, createActivityLog } = require("../services/ActivityLogServices")
const RuleEngineServices = require("../services/RuleEngineServices")
const LeadServices = require("../services/leadServices")
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
            const prev_status = lead.lead_status

            const updatePayload = {
                lead_status: "Not met criteria",
                last_updated_status: "Not met criteria",
                sub_status: failureReason,
                updatedAt: new Date().toISOString()
            }

            await lead.update(updatePayload, { transaction })
            
            // create activity log
            const logData = createLogData(
                ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                    prev_status,
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

            // Use the updated lead instance (no need for extra query)
            // Reload to get the latest data if needed, but update() usually updates the instance
            await lead.reload({ transaction })

            await transaction.commit()

            return ApiResponse(
                res,
                "ERROR", // You might want to use "SUCCESS" with a different status code for business logic failures
                400,
                autoRejectDescription,
                {
                    lead: lead.get({ plain: true }), // Convert to plain object for response
                    failureReason: failureReason,
                    meetsCriteria: false
                }
            )
        }

        await transaction.commit()

        return ApiResponse(res, "SUCCESS", 200, "Meets score card criteria", {
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