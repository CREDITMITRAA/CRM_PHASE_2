const { Team, TeamMember } = require("../models")

async function createTeam(teamData, transaction = null){
    if(!transaction){
        throw new Error("Transaction is required for creating team")
    }
    const { teamName:name, teamOwnerId:team_owner_id, createdBy:created_by } = teamData
    const savedTeam = await Team.create({
        name, team_owner_id, created_by
    },  { transaction })

    return savedTeam
}

async function addTeamMembers(teamId, teamMemberIds, transaction){
    if (!transaction) {
        throw new Error("Transaction is required for adding team members");
    }

    // prepare team members data
    const teamMembersData = teamMemberIds.map(user_id => ({
        team_id: teamId,
        user_id,
    }))

    const createdMembers = await TeamMember.bulkCreate(teamMembersData, {transaction})

    return createdMembers
}

module.exports = {
    createTeam,
    addTeamMembers
}