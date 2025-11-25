const { sequelize, ReportRuleEngineResult } = require("../models")
const { createLogData, createActivityLog } = require("../services/ActivityLogServices")
const RuleEngineServices = require("../services/RuleEngineServices")
const LeadServices = require("../services/leadServices")
const ActivityLogServices = require("../services/ActivityLogServices")
const { ACTIVITY_LOGS, ACTIVITY_TYPES } = require("../utilities/ActivityLogConstants")
const { ApiResponse } = require("../utilities/api-responses/ApiResponse")

async function runRuleEngine(req, res) {
    console.log('[Rule Engine] runRuleEngine called with body:', JSON.stringify(req.body, null, 2))
    const transaction = await sequelize.transaction()
    try {
        const { 
            leadId,
            lead_id,
            userId,
            user_id,
            reportType,
            report_type,
            dob, 
            repaymentHistory,
            repayment_history
        } = req.body
        
        // Handle both camelCase and snake_case field names
        const finalLeadId = leadId || lead_id
        const finalUserId = userId || user_id
        const finalReportType = reportType || report_type
        const finalDob = dob
        const finalRepaymentHistory = repaymentHistory || repayment_history
        
        console.log('[Rule Engine] Extracted values:', { 
            leadId: finalLeadId, 
            userId: finalUserId, 
            reportType: finalReportType, 
            hasDob: !!finalDob, 
            hasRepaymentHistory: !!finalRepaymentHistory 
        })
        
        if (!finalLeadId || !finalUserId) {
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }

        // If reportType is provided AND (dob or repaymentHistory is provided), this is a credit report rule engine run
        // Otherwise, run the original score card rule engine
        if (finalReportType && (finalDob || finalRepaymentHistory)) {
            console.log('[Rule Engine] Routing to credit report rule engine')
            return await runCreditReportRuleEngine(
                req, 
                res, 
                transaction, 
                finalLeadId, 
                finalUserId, 
                finalReportType, 
                finalDob, 
                finalRepaymentHistory
            )
        }
        
        console.log('[Rule Engine] Routing to score card rule engine')

        // Otherwise, run the original score card rule engine
        // get lead by leadId
        const lead = await LeadServices.getLead(finalLeadId, transaction)
        if (!lead) {
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Lead not found !")
        }

        // Get the current lead status
        const currentLeadStatus = lead.lead_status;

        // Determine the target status to restore to
        let targetStatus = currentLeadStatus;

        // If current status is "Not met criteria", we need to find the previous status
        if (currentLeadStatus === "Not met criteria") {
            // Get the latest status from activity logs using service method
            const latestActivityLog = await ActivityLogServices.getRecentActivityLogByLeadIdAndActivityType(
                finalLeadId, 
                ACTIVITY_TYPES.LEAD_STATUS_UPDATE
            );

            // Default to "Not Contacted" if no activity log found
            targetStatus = "Not Contacted";

            // If we found an activity log, extract the previous status from the description
            if (latestActivityLog) {
                // Parse the activity description to get previous status
                // Example: "Lead status updated from Ineligible to Not met criteria - Does not meet score card criteria"
                const activityDesc = latestActivityLog.activity_desc;
                const fromMatch = activityDesc.match(/from (.+?) to/);
                if (fromMatch) {
                    targetStatus = fromMatch[1].trim();
                }
            }
        } else {
            // If current status is not "Not met criteria", use the current status
            targetStatus = currentLeadStatus;
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
        
        // Store score card rule engine result
        // SCORE_CARD rule engine evaluates based on: Company Category, Salary, and Age criteria
        // - Company Category: SUPER CAT, CAT A, CAT B, CAT C, CAT D
        // - Salary: Must meet minimum requirements based on company category
        // - Age: Must be between 21 and 55 years (currently commented out in validation)
        const ruleEngineResult = {
            status: passesScoreCard ? 'APPROVED' : 'REJECTED',
            messages: passesScoreCard 
                ? ['All criteria passed. Application approved.'] 
                : [RuleEngineServices.getScoreCardFailureReason(lead)]
        }

        // Use findOrCreate to get or create score card result
        const [reportResult, created] = await ReportRuleEngineResult.findOrCreate({
            where: {
                lead_id: finalLeadId,
                report_type: 'SCORE_CARD',
                record_status: 'active'
            },
            defaults: {
                lead_id: finalLeadId,
                report_type: 'SCORE_CARD',
                status: ruleEngineResult.status,
                reason: ruleEngineResult.messages.join('; '),
                rejection_reasons: ruleEngineResult.status === 'REJECTED' ? ruleEngineResult.messages : [],
                dob: null,
                repayment_history: null,
                repayment_history_0_to_3_and_6_months: null,
                updated_by: finalUserId,
                created_by: finalUserId
            },
            transaction
        })

        // If record exists, update it with new data (this will update updatedAt)
        if (!created) {
            await ReportRuleEngineResult.update({
                status: ruleEngineResult.status,
                reason: ruleEngineResult.messages.join('; '),
                rejection_reasons: ruleEngineResult.status === 'REJECTED' ? ruleEngineResult.messages : [],
                updated_by: finalUserId
            }, {
                where: { id: reportResult.id },
                transaction
            })
            await reportResult.reload({ transaction })
        }
        
        // Ensure report_type is set correctly (safeguard in case of ENUM issues)
        if (!reportResult.report_type || reportResult.report_type === '') {
            await reportResult.update({ report_type: 'SCORE_CARD' }, { transaction })
            await reportResult.reload({ transaction })
        }

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
                    currentLeadStatus, // Use the current status before update
                    "Not met criteria",
                    null,
                    failureReason
                ),
                ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
                finalUserId,
                finalLeadId,
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
                    meetsCriteria: false,
                    reportResult: reportResult.get({ plain: true }),
                    ruleEngineResult: ruleEngineResult
                }
            )
        }

        // When criteria matches - update lead status to target status (recent status or previous status)
        const successDescription = `Meets score card criteria - Status auto updated to ${targetStatus}`
        
        // Update lead with target status
        const updatePayload = {
            lead_status: targetStatus, // Use target status (recent status or previous status before "Not met criteria")
            last_updated_status: targetStatus,
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
                targetStatus, // New status (target status to restore to)
                null
            ),
            ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
            finalUserId,
            finalLeadId,
            successDescription,
            lead.name
        )
        await createActivityLog(logData, transaction)

        await lead.reload({ transaction })
        await transaction.commit()

        return ApiResponse(res, "SUCCESS", 200, successDescription, {
            lead: lead.get({ plain: true }),
            meetsCriteria: true,
            reportResult: reportResult.get({ plain: true }),
            ruleEngineResult: ruleEngineResult
        })

    } catch (error) {
        await transaction.rollback()
        console.log("Failed to run rule engine = ", error);
        return ApiResponse(res, "ERROR", 500, error?.message || "Failed to run rule engine !", null, error)
    }
}

async function runCreditReportRuleEngine(
    req, 
    res, 
    transaction, 
    leadId, 
    userId, 
    reportType, 
    dob, 
    repaymentHistory
) {
    console.log('='.repeat(50))
    console.log('[Rule Engine] runCreditReportRuleEngine STARTED')
    console.log('[Rule Engine] Parameters:', { leadId, userId, reportType, hasDob: !!dob, hasRepaymentHistory: !!repaymentHistory })
    console.log('='.repeat(50))
    try {
        // Validate report type
        const validReportTypes = ['CRIF', 'CIBIL', 'EXPERIAN', 'CRIF_PARSED', 'OTHER']
        console.log('[Rule Engine] Validating report type:', reportType, 'Valid types:', validReportTypes)
        if (!validReportTypes.includes(reportType)) {
            console.log('[Rule Engine] Invalid report type, rolling back')
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, `Invalid report type. Must be one of: ${validReportTypes.join(', ')}`)
        }
        console.log('[Rule Engine] Report type validated successfully')

        // Test database connection and ENUM by trying to query existing records
        try {
            const testQuery = await ReportRuleEngineResult.findOne({
                where: { report_type: reportType },
                limit: 1,
                transaction
            })
            console.log(`[Rule Engine] Database connection OK. Test query for report_type '${reportType}' ${testQuery ? 'found existing record' : 'no existing records'}`)
        } catch (dbTestError) {
            console.error(`[Rule Engine] Database test query failed:`, dbTestError?.message)
            if (dbTestError?.message?.includes('enum') || dbTestError?.message?.includes('ENUM')) {
                console.error(`[Rule Engine] ENUM ERROR DETECTED: Database ENUM may not include '${reportType}'`)
                await transaction.rollback()
                return ApiResponse(res, "ERROR", 500, `Database ENUM error: The report_type '${reportType}' may not be in the database ENUM. Please update the database schema.`, {
                    error: dbTestError?.message,
                    sqlFix: `ALTER TABLE ReportRuleEngineResults MODIFY COLUMN report_type ENUM('CRIF', 'CIBIL', 'EXPERIAN', 'CRIF_PARSED', 'SCORE_CARD', 'OTHER') NOT NULL;`
                })
            }
        }

        // Get lead
        const lead = await LeadServices.getLead(leadId, transaction)
        if (!lead) {
            console.error(`[Rule Engine] Lead not found for leadId: ${leadId}`)
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Lead not found !")
        }
        console.log(`[Rule Engine] Lead found: ${lead.id}, Name: ${lead.name}`)

        // ========== ALWAYS RUN SCORE_CARD RULE ENGINE ==========
        // Score card should always be checked and updated when running any report type
        // because user may have changed lead details (salary, company category, etc.)
        console.log(`[Rule Engine] Running SCORE_CARD rule engine...`)
        
        // Check for required fields to run score card rule engine
        const missingFields = RuleEngineServices.getMissingMandatoryFields(lead)
        if (missingFields.length > 0) {
            console.log(`[Rule Engine] Missing mandatory fields for SCORE_CARD: ${missingFields.join(', ')}`)
            // Continue anyway - we'll store the result with rejection reason
        }

        const passesScoreCard = RuleEngineServices.runFirstLevelScoreCardCriteria(lead)
        
        // Store score card rule engine result
        const scoreCardResult = {
            status: passesScoreCard ? 'APPROVED' : 'REJECTED',
            messages: passesScoreCard 
                ? ['All criteria passed. Application approved.'] 
                : [RuleEngineServices.getScoreCardFailureReason(lead)]
        }

        // Use findOrCreate to get or create SCORE_CARD result
        const [scoreCardReportResult, scoreCardCreated] = await ReportRuleEngineResult.findOrCreate({
            where: {
                lead_id: leadId,
                report_type: 'SCORE_CARD',
                record_status: 'active'
            },
            defaults: {
                lead_id: leadId,
                report_type: 'SCORE_CARD',
                status: scoreCardResult.status,
                reason: scoreCardResult.messages.join('; '),
                rejection_reasons: scoreCardResult.status === 'REJECTED' ? scoreCardResult.messages : [],
                dob: null,
                repayment_history: null,
                repayment_history_0_to_3_and_6_months: null,
                updated_by: userId,
                created_by: userId
            },
            transaction
        })

        // If record exists, update it with new data (this will update updatedAt)
        if (!scoreCardCreated) {
            await ReportRuleEngineResult.update({
                status: scoreCardResult.status,
                reason: scoreCardResult.messages.join('; '),
                rejection_reasons: scoreCardResult.status === 'REJECTED' ? scoreCardResult.messages : [],
                updated_by: userId
            }, {
                where: { id: scoreCardReportResult.id },
                transaction
            })
            await scoreCardReportResult.reload({ transaction })
        }
        console.log(`[Rule Engine] SCORE_CARD record ${scoreCardCreated ? 'created' : 'updated'} - ID: ${scoreCardReportResult.id}, Status: ${scoreCardReportResult.status}, UpdatedAt: ${scoreCardReportResult.updatedAt}`)

        // Update lead status and sub_status based on SCORE_CARD result (old logic)
        const currentLeadStatus = lead.lead_status
        let targetStatus = currentLeadStatus

        // If current status is "Not met criteria", find the previous status
        if (currentLeadStatus === "Not met criteria") {
            const latestActivityLog = await ActivityLogServices.getRecentActivityLogByLeadIdAndActivityType(
                leadId, 
                ACTIVITY_TYPES.LEAD_STATUS_UPDATE
            )
            targetStatus = "Not Contacted"
            if (latestActivityLog) {
                const activityDesc = latestActivityLog.activity_desc
                const fromMatch = activityDesc.match(/from (.+?) to/)
                if (fromMatch) {
                    targetStatus = fromMatch[1].trim()
                }
            }
        }

        if (!passesScoreCard) {
            // SCORE_CARD failed - update lead status to "Not met criteria" with SCORE_CARD failure reason
            const failureReason = RuleEngineServices.getScoreCardFailureReason(lead)
            const autoRejectDescription = `Auto-rejected: ${failureReason}`

            const updatePayload = {
                lead_status: "Not met criteria",
                last_updated_status: "Not met criteria",
                is_eligibility_criteria_checked: true,
                sub_status: failureReason, // SCORE_CARD specific reason in sub_status
                updatedAt: new Date().toISOString()
            }

            await lead.update(updatePayload, { transaction })
            
            // Create activity log
            const logData = createLogData(
                ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                    currentLeadStatus,
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
            await lead.reload({ transaction })
            console.log(`[Rule Engine] Lead status updated to "Not met criteria" due to SCORE_CARD failure: ${failureReason}`)
        } else {
            // SCORE_CARD passed - restore to target status if currently "Not met criteria"
            if (currentLeadStatus === "Not met criteria") {
                const successDescription = `Meets score card criteria - Status auto updated to ${targetStatus}`
                
                const updatePayload = {
                    lead_status: targetStatus,
                    last_updated_status: targetStatus,
                    is_eligibility_criteria_checked: true,
                    sub_status: null,
                    updatedAt: new Date().toISOString()
                }

                await lead.update(updatePayload, { transaction })
                
                // Create activity log
                const logData = createLogData(
                    ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                        currentLeadStatus,
                        targetStatus,
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
                console.log(`[Rule Engine] Lead status restored to "${targetStatus}" due to SCORE_CARD pass`)
            }
        }
        // ========== END SCORE_CARD RULE ENGINE ==========

        // Run credit report rule engine
        // The function will extract 0_3_months and 0_6_months directly from repaymentHistory
        const ruleEngineResult = RuleEngineServices.runCreditReportRuleEngine(
            dob,
            repaymentHistory
        )
        
        // Debug log to help troubleshoot
        console.log(`Rule Engine Result for ${reportType}:`, {
            status: ruleEngineResult.status,
            messages: ruleEngineResult.messages,
            dob: dob,
            hasRepaymentHistory: !!repaymentHistory
        })

        // Extract 0_3_months and 0_6_months from repaymentHistory for storage
        let periods0To3And6Months = null
        if (Array.isArray(repaymentHistory)) {
            periods0To3And6Months = repaymentHistory.filter(
                item => item.repayment_duration === "0_3_months" || 
                        item.repayment_duration === "0_6_months"
            )
            // If no periods found, set to null
            if (periods0To3And6Months.length === 0) {
                periods0To3And6Months = null
            }
        }

        // Validate report_type is valid before creating record (reportType already validated above, but double-check)
        if (!['CRIF', 'CIBIL', 'EXPERIAN', 'CRIF_PARSED', 'SCORE_CARD', 'OTHER'].includes(reportType)) {
            throw new Error(`Invalid report_type: ${reportType}. Must be one of: CRIF, CIBIL, EXPERIAN, CRIF_PARSED, SCORE_CARD, OTHER`)
        }
        
        const resultData = {
            lead_id: leadId,
            report_type: reportType,
            status: ruleEngineResult.status,
            reason: ruleEngineResult.messages.join('; '),
            rejection_reasons: ruleEngineResult.status === 'REJECTED' ? ruleEngineResult.messages : [],
            dob: dob || null,
            repayment_history: repaymentHistory || null,
            repayment_history_0_to_3_and_6_months: periods0To3And6Months,
            updated_by: userId,
            created_by: userId
        }
        
        console.log(`[Rule Engine] Prepared resultData with report_type: ${resultData.report_type}, status: ${resultData.status}`)

        // Use findOrCreate to get or create credit report result
        let reportResult
        try {
            const [foundOrCreatedResult, created] = await ReportRuleEngineResult.findOrCreate({
                where: {
                    lead_id: leadId,
                    report_type: reportType,
                    record_status: 'active'
                },
                defaults: resultData,
                transaction
            })
            
            reportResult = foundOrCreatedResult
            
            // If record exists, update it with new data (this will update updatedAt)
            if (!created) {
                await ReportRuleEngineResult.update({
                    status: ruleEngineResult.status,
                    reason: ruleEngineResult.messages.join('; '),
                    rejection_reasons: ruleEngineResult.status === 'REJECTED' ? ruleEngineResult.messages : [],
                    dob: dob || null,
                    repayment_history: repaymentHistory || null,
                    repayment_history_0_to_3_and_6_months: periods0To3And6Months,
                    updated_by: userId
                }, {
                    where: { id: reportResult.id },
                    transaction
                })
                await reportResult.reload({ transaction })
            }
            
            console.log(`[Rule Engine] Record ${created ? 'created' : 'updated'} successfully - ID: ${reportResult.id}, Status: ${reportResult.status}, ReportType: ${reportResult.report_type}, UpdatedAt: ${reportResult.updatedAt}`)
        } catch (error) {
            console.error(`[Rule Engine] Error in findOrCreate/update record:`, error)
            console.error(`[Rule Engine] Error details:`, {
                message: error?.message,
                name: error?.name,
                errors: error?.errors,
                stack: error?.stack
            })
            
            // Check if it's an ENUM validation error
            if (error?.message?.includes('ENUM') || error?.message?.includes('Invalid enum value') || error?.message?.toLowerCase().includes('enum')) {
                console.error(`[Rule Engine] ========== DATABASE ENUM ERROR ==========`)
                console.error(`[Rule Engine] The database ENUM for report_type may not include '${reportType}'`)
                console.error(`[Rule Engine] Please run this SQL to fix:`)
                console.error(`[Rule Engine] ALTER TABLE ReportRuleEngineResults MODIFY COLUMN report_type ENUM('CRIF', 'CIBIL', 'EXPERIAN', 'CRIF_PARSED', 'SCORE_CARD', 'OTHER') NOT NULL;`)
                console.error(`[Rule Engine] Or if table name is different:`)
                console.error(`[Rule Engine] ALTER TABLE report_rule_engine_results MODIFY COLUMN report_type ENUM('CRIF', 'CIBIL', 'EXPERIAN', 'CRIF_PARSED', 'SCORE_CARD', 'OTHER') NOT NULL;`)
                console.error(`[Rule Engine] ==========================================`)
            }
            
            throw error
        }
        
        if (!reportResult) {
            throw new Error(`Failed to create or find report result for leadId: ${leadId}, reportType: ${reportType}`)
        }

        // Get all existing report results (only reports that have been run)
        // This will include the report we just created/updated
        const allReportResults = await ReportRuleEngineResult.findAll({
            where: {
                lead_id: leadId,
                record_status: 'active'
            },
            transaction
        })

        // Get the latest status from activity logs
        const latestActivityLog = await ActivityLogServices.getRecentActivityLogByLeadIdAndActivityType(
            leadId, 
            ACTIVITY_TYPES.LEAD_STATUS_UPDATE
        )

        let previousStatus = "Not Contacted"
        if (latestActivityLog) {
            const activityDesc = latestActivityLog.activity_desc
            const fromMatch = activityDesc.match(/from (.+?) to/)
            if (fromMatch) {
                previousStatus = fromMatch[1].trim()
            }
        }

        // Only consider reports that have actually been run (exist in database)
        // Reports that haven't been run yet won't affect the lead status
        // Note: SCORE_CARD status has already been handled above and sub_status is set accordingly

        // Get current SCORE_CARD result from allReportResults (it was just updated)
        const scoreCardResultFromDb = allReportResults.find(r => r.report_type === 'SCORE_CARD')
        const scoreCardFailed = scoreCardResultFromDb && scoreCardResultFromDb.status === 'REJECTED'

        // If this credit report failed, update lead status to "Not met criteria"
        if (ruleEngineResult.status === 'REJECTED') {
            const failureReason = ruleEngineResult.messages.join('; ')
            const autoRejectDescription = `Auto-rejected (${reportType}): ${failureReason}`

            // Determine sub_status: If SCORE_CARD already failed, keep SCORE_CARD reason, otherwise use credit report reason
            let subStatusReason
            if (scoreCardFailed && scoreCardResultFromDb) {
                // SCORE_CARD failed - keep SCORE_CARD reason in sub_status (it was set above)
                subStatusReason = scoreCardResultFromDb.reason || scoreCardResultFromDb.rejection_reasons?.join('; ') || 'SCORE_CARD criteria not met'
            } else {
                // SCORE_CARD passed or doesn't exist - use credit report reason
                subStatusReason = `${reportType} - ${failureReason}`
            }

            // Get current lead status before update
            const currentStatusBeforeUpdate = lead.lead_status

            const updatePayload = {
                lead_status: "Not met criteria",
                last_updated_status: "Not met criteria",
                is_eligibility_criteria_checked: true,
                sub_status: subStatusReason,
                updatedAt: new Date().toISOString()
            }

            await lead.update(updatePayload, { transaction })
            
            // Create activity log
            const logData = createLogData(
                ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                    currentStatusBeforeUpdate,
                    "Not met criteria",
                    null,
                    subStatusReason
                ),
                ACTIVITY_TYPES.LEAD_STATUS_UPDATE,
                userId,
                leadId,
                autoRejectDescription,
                lead.name
            )
            await createActivityLog(logData, transaction)
            
            await lead.reload({ transaction })
            console.log(`Report ${reportType} rejected. Lead status updated to "Not met criteria" with sub_status: ${subStatusReason}`)
        } else {
            // If this credit report passed, check if ALL existing credit reports have passed
            // Only consider credit reports (exclude SCORE_CARD as it's handled separately)
            const creditReports = allReportResults.filter(r => r.report_type !== 'SCORE_CARD')
            const allCreditReportsPassed = creditReports.length > 0 && 
                                           creditReports.every(r => r.status === 'APPROVED')
            
            // If all credit reports passed AND SCORE_CARD passed, and lead status is "Not met criteria", restore previous status
            // If SCORE_CARD failed, keep status as "Not met criteria" with SCORE_CARD reason in sub_status
            if (allCreditReportsPassed && !scoreCardFailed && lead.lead_status === "Not met criteria") {
                const successDescription = `All reports passed - Status auto updated to ${previousStatus}`
                
                const updatePayload = {
                    lead_status: previousStatus,
                    last_updated_status: previousStatus,
                    is_eligibility_criteria_checked: true,
                    sub_status: null,
                    updatedAt: new Date().toISOString()
                }

                const currentStatusBeforeUpdate = lead.lead_status
                await lead.update(updatePayload, { transaction })
                
                // Create activity log
                const logData = createLogData(
                    ACTIVITY_LOGS.LEAD_STATUS_UPDATE(
                        currentStatusBeforeUpdate,
                        previousStatus,
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
            } else if (allCreditReportsPassed && scoreCardFailed) {
                // All credit reports passed but SCORE_CARD failed - status already set above with SCORE_CARD reason
                console.log(`All credit reports passed, but SCORE_CARD failed. Lead status remains "Not met criteria" with SCORE_CARD reason.`)
            }
        }

        // Verify reportResult one more time before commit
        if (!reportResult) {
            throw new Error('reportResult is null before commit')
        }
        
        console.log(`[Rule Engine] About to commit transaction. ReportResult ID: ${reportResult.id}, ReportType: ${reportResult.report_type}, Status: ${reportResult.status}`)
        
        await transaction.commit()
        
        console.log(`[Rule Engine] Transaction committed successfully. Final reportResult ID: ${reportResult.id}, ReportType: ${reportResult.report_type}, Status: ${reportResult.status}`)
        
        // Verify record exists after commit by querying database
        const verifyRecord = await ReportRuleEngineResult.findOne({
            where: {
                id: reportResult.id,
                lead_id: leadId,
                report_type: reportType
            }
        })
        
        if (verifyRecord) {
            console.log(`[Rule Engine] Record verified in database after commit - ID: ${verifyRecord.id}`)
        } else {
            console.error(`[Rule Engine] WARNING: Record not found in database after commit! ID: ${reportResult.id}`)
        }

        return ApiResponse(res, "SUCCESS", 200, `Rule engine executed for ${reportType}`, {
            reportResult: reportResult ? reportResult.get({ plain: true }) : null,
            ruleEngineResult: ruleEngineResult,
            scoreCardResult: scoreCardReportResult ? scoreCardReportResult.get({ plain: true }) : null,
            scoreCardRuleEngineResult: scoreCardResult,
            lead: lead.get({ plain: true }),
            allReportResults: allReportResults.map(r => ({
                id: r.id,
                report_type: r.report_type,
                status: r.status,
                reason: r.reason,
                updatedAt: r.updatedAt
            }))
        })

    } catch (error) {
        await transaction.rollback()
        console.error("=".repeat(50))
        console.error("[Rule Engine] ERROR in runCreditReportRuleEngine:", error)
        console.error("[Rule Engine] Error message:", error?.message)
        console.error("[Rule Engine] Error stack:", error?.stack)
        console.error("=".repeat(50))
        return ApiResponse(res, "ERROR", 500, error?.message || "Failed to run credit report rule engine !", null, error)
    }
}

async function getReportRuleEngineResultsByLeadId(req, res) {
    try {
        const { leadId } = req.params

        // Validate leadId
        if (!leadId || isNaN(leadId) || parseInt(leadId) <= 0) {
            return ApiResponse(res, "ERROR", 400, "Invalid Lead ID!")
        }

        const validLeadId = parseInt(leadId)

        // Check if the lead exists
        const lead = await LeadServices.getLead(validLeadId)
        if (!lead) {
            return ApiResponse(res, "ERROR", 400, "Lead not found!")
        }

        // Fetch all report rule engine results for this lead
        const reportResults = await ReportRuleEngineResult.findAll({
            where: {
                lead_id: validLeadId,
                record_status: 'active'
            },
            order: [['updatedAt', 'DESC']]
        })

        return ApiResponse(res, "SUCCESS", 200, "Report rule engine results retrieved successfully", {
            leadId: validLeadId,
            reportResults: reportResults.map(r => r.get({ plain: true }))
        })

    } catch (error) {
        console.log("Failed to get report rule engine results = ", error)
        return ApiResponse(res, "ERROR", 500, error?.message || "Failed to get report rule engine results !", null, error)
    }
}

module.exports = {
    runRuleEngine,
    getReportRuleEngineResultsByLeadId
}