const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const UserServices = require("../services/UserServices")
const TeamServices = require("../services/TeamServices");
const { sequelize } = require("../models");

async function createTeam(req,res){
    const transaction = await sequelize.transaction()
    try {
        const { teamName, teamOwnerId, createdBy, teamMemberIds } = req.body
        if (!teamName || !teamOwnerId || !createdBy){
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Missing required fields !")
        }
        if(!Array.isArray(teamMemberIds)){
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "Team member ids must be in an array !")
        }
        if(Array.isArray(teamMemberIds) && !teamMemberIds.length > 0){
            await transaction.rollback()
            return ApiResponse(res, "ERROR", 400, "At least one team member is needed to create team !")
        }

        // check for all users availability
        const allUserIds = [...new Set([teamOwnerId, createdBy, ...teamMemberIds])]
        await UserServices.checkUsersExist(allUserIds)

        // create the team
        const savedTeam = TeamServices.createTeam({teamName, teamOwnerId, createdBy}, transaction)
        if(!savedTeam){
            throw new Error("Failed to create team !")
        }

        // saved team members with team id
        const teamMembers = await TeamServices.addTeamMembers(savedTeam.id, teamMemberIds, transaction)

        await transaction.commit()

        return ApiResponse(
            res, 
            "SUCCESS",
            201,
            "Team created successfully !",
            {
                team: savedTeam,
                teamMembers,
                membersCount: teamMembers.length
            }
        )

    } catch (error) {
        await transaction.rollback()
        console.log("Failed to create team = ", error);
        if (error.message.includes('Users not found with IDs')) {
            return ApiResponse(res, "ERROR", 404, `One or more users not found: ${error.message.split('IDs: ')[1]}`);
        }
        if (error.message.includes('Invalid user IDs provided')) {
            return ApiResponse(res, "ERROR", 400, `Invalid user IDs: ${error.message.split('provided: ')[1]}`);
        }
        return ApiResponse(res, "ERROR", 500, error?.message || "Failed to create team !", null, error)
    }
}

module.exports = {
    createTeam
}