const express = require('express');
const userController = require('../controllers/userController');
const { authenticate } = require('../middlewares/authenticationMiddleware');
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants');
const router = express.Router();

// User routes
router.get('/get-users-name-and-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), userController.getUsersNameAndId)
router.get('/get-users-by-name', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), userController.getUsersByName)
router.get('/get-all-users', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), userController.getAllUsers); // Get all users
router.post('/', userController.createUser); // Create a user
router.get('/:id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), userController.getUserById); // Get a specific user
router.put('/:id',authenticate([ROLE_ADMIN]), userController.updateUser); // Update a user
router.delete('/:id', authenticate([ROLE_ADMIN]), userController.deleteUserByUserId); // Delete a user
router.put('/update-profile-image-url/:userId', authenticate([ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_MANAGER]), userController.updateProfileImageUrl);

module.exports = router;
