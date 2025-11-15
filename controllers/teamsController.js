// Adjust the import path based on your project structure
// This assumes models are exported from a central index file
const db = require('../models'); // or '../models/index'
const { Team, TeamMember, User, Role } = db;
const { Op } = require('sequelize');

// Get all teams with team leader and members
exports.getAllTeams = async (req, res) => {
  try {
    const teams = await Team.findAll({
      include: [
        {
          model: User,
          as: 'teamLeader',
          attributes: ['id', 'name', 'email', 'employee_id', 'designation'],
          required: false
        },
        {
          model: TeamMember,
          as: 'teamMembers',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'employee_id', 'designation'],
              required: false
            }
          ],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Transform the data to match frontend expectations
    const transformedTeams = teams.map(team => ({
      id: team.id,
      name: team.name,
      team_leader_id: team.team_leader_id,
      team_leader: team.teamLeader ? {
        id: team.teamLeader.id,
        name: team.teamLeader.name,
        email: team.teamLeader.email,
        employee_id: team.teamLeader.employee_id,
        designation: team.teamLeader.designation
      } : null,
      team_members: team.teamMembers ? team.teamMembers.map(tm => ({
        id: tm.user ? tm.user.id : tm.user_id,
        name: tm.user ? tm.user.name : null,
        email: tm.user ? tm.user.email : null,
        employee_id: tm.user ? tm.user.employee_id : null,
        designation: tm.user ? tm.user.designation : null
      })) : [],
      status: team.status,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    }));

    res.status(200).json({
      success: true,
      data: transformedTeams,
      message: 'Teams fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teams',
      error: error.message
    });
  }
};

// Create a new team
exports.createTeam = async (req, res) => {
  try {
    const { name, team_leader_id, team_member_ids } = req.body;

    // Validate input
    if (!name || !team_leader_id || !team_member_ids || !Array.isArray(team_member_ids) || team_member_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Team name, team leader, and at least one team member are required'
      });
    }

    // Check if team leader is in the members list (should not be)
    if (team_member_ids.includes(team_leader_id)) {
      return res.status(400).json({
        success: false,
        message: 'Team leader cannot be a team member'
      });
    }

    // Verify team leader exists
    const teamLeader = await User.findByPk(team_leader_id);
    if (!teamLeader) {
      return res.status(404).json({
        success: false,
        message: 'Team leader not found'
      });
    }

    // Verify all team members exist
    const members = await User.findAll({
      where: {
        id: {
          [Op.in]: team_member_ids
        }
      }
    });

    if (members.length !== team_member_ids.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more team members not found'
      });
    }

    // Create team
    const team = await Team.create({
      name,
      team_leader_id
    });

    // Create team members
    const teamMembersData = team_member_ids.map(user_id => ({
      team_id: team.id,
      user_id
    }));

    await TeamMember.bulkCreate(teamMembersData);

    // Fetch the created team with relations
    const createdTeam = await Team.findByPk(team.id, {
      include: [
        {
          model: User,
          as: 'teamLeader',
          attributes: ['id', 'name', 'email', 'employee_id', 'designation'],
          required: false
        },
        {
          model: TeamMember,
          as: 'teamMembers',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'employee_id', 'designation'],
              required: false
            }
          ],
          required: false
        }
      ]
    });

    // Transform the data
    const transformedTeam = {
      id: createdTeam.id,
      name: createdTeam.name,
      team_leader_id: createdTeam.team_leader_id,
      team_leader: createdTeam.teamLeader ? {
        id: createdTeam.teamLeader.id,
        name: createdTeam.teamLeader.name,
        email: createdTeam.teamLeader.email,
        employee_id: createdTeam.teamLeader.employee_id,
        designation: createdTeam.teamLeader.designation
      } : null,
      team_members: createdTeam.teamMembers ? createdTeam.teamMembers.map(tm => ({
        id: tm.user ? tm.user.id : tm.user_id,
        name: tm.user ? tm.user.name : null,
        email: tm.user ? tm.user.email : null,
        employee_id: tm.user ? tm.user.employee_id : null,
        designation: tm.user ? tm.user.designation : null
      })) : [],
      status: createdTeam.status,
      createdAt: createdTeam.createdAt,
      updatedAt: createdTeam.updatedAt
    };

    res.status(201).json({
      success: true,
      data: transformedTeam,
      message: 'Team created successfully'
    });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create team',
      error: error.message
    });
  }
};

// Update a team
exports.updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, team_leader_id, team_member_ids } = req.body;

    const team = await Team.findByPk(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Validate input
    if (!name || !team_leader_id || !team_member_ids || !Array.isArray(team_member_ids) || team_member_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Team name, team leader, and at least one team member are required'
      });
    }

    // Check if team leader is in the members list
    if (team_member_ids.includes(team_leader_id)) {
      return res.status(400).json({
        success: false,
        message: 'Team leader cannot be a team member'
      });
    }

    // Verify team leader exists
    const teamLeader = await User.findByPk(team_leader_id);
    if (!teamLeader) {
      return res.status(404).json({
        success: false,
        message: 'Team leader not found'
      });
    }

    // Verify all team members exist
    const members = await User.findAll({
      where: {
        id: {
          [Op.in]: team_member_ids
        }
      }
    });

    if (members.length !== team_member_ids.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more team members not found'
      });
    }

    // Update team
    await team.update({
      name,
      team_leader_id
    });

    // Delete existing team members
    await TeamMember.destroy({
      where: { team_id: id }
    });

    // Create new team members
    const teamMembersData = team_member_ids.map(user_id => ({
      team_id: id,
      user_id
    }));

    await TeamMember.bulkCreate(teamMembersData);

    // Fetch the updated team with relations
    const updatedTeam = await Team.findByPk(id, {
      include: [
        {
          model: User,
          as: 'teamLeader',
          attributes: ['id', 'name', 'email', 'employee_id', 'designation'],
          required: false
        },
        {
          model: TeamMember,
          as: 'teamMembers',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'employee_id', 'designation'],
              required: false
            }
          ],
          required: false
        }
      ]
    });

    // Transform the data
    const transformedTeam = {
      id: updatedTeam.id,
      name: updatedTeam.name,
      team_leader_id: updatedTeam.team_leader_id,
      team_leader: updatedTeam.teamLeader ? {
        id: updatedTeam.teamLeader.id,
        name: updatedTeam.teamLeader.name,
        email: updatedTeam.teamLeader.email,
        employee_id: updatedTeam.teamLeader.employee_id,
        designation: updatedTeam.teamLeader.designation
      } : null,
      team_members: updatedTeam.teamMembers ? updatedTeam.teamMembers.map(tm => ({
        id: tm.user ? tm.user.id : tm.user_id,
        name: tm.user ? tm.user.name : null,
        email: tm.user ? tm.user.email : null,
        employee_id: tm.user ? tm.user.employee_id : null,
        designation: tm.user ? tm.user.designation : null
      })) : [],
      status: updatedTeam.status,
      createdAt: updatedTeam.createdAt,
      updatedAt: updatedTeam.updatedAt
    };

    res.status(200).json({
      success: true,
      data: transformedTeam,
      message: 'Team updated successfully'
    });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team',
      error: error.message
    });
  }
};

// Delete a team
exports.deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findByPk(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Delete team members first (due to foreign key constraint)
    await TeamMember.destroy({
      where: { team_id: id }
    });

    // Delete team
    await team.destroy();

    res.status(200).json({
      success: true,
      data: id,
      message: 'Team deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete team',
      error: error.message
    });
  }
};