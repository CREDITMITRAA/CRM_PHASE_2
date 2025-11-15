const express = require('express');
const router = express.Router();
const teamsController = require('../controllers/teamsController');

// Get all teams
router.get('/get-all-teams', teamsController.getAllTeams);

// Create a new team
router.post('/add-team', teamsController.createTeam);

// Update a team
router.put('/:id', teamsController.updateTeam);

// Delete a team
router.delete('/:id', teamsController.deleteTeam);

module.exports = router;

