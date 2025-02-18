const express = require('express');
const roleController = require('../controllers/roleController');
const { authenticate } = require('../middlewares/authenticationMiddleware');
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants');
const router = express.Router();


// Role routes
router.get('/', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), roleController.getAllRoles); // Get all roles
router.post('/', authenticate([ROLE_ADMIN]), roleController.createRole); // Create a role
router.get('/:id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), roleController.getRoleById); // Get a specific role
router.put('/:id', authenticate([ROLE_ADMIN]), roleController.updateRole); // Update a role
router.delete('/:id', authenticate([ROLE_ADMIN]), roleController.deleteRole); // Delete a role

module.exports = router;
