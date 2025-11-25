
const { Role } = require('../models');
const { ApiResponse } = require('../utilities/api-responses/ApiResponse');

module.exports = {
  async getAllRoles(req, res) {
    try {
      const roles = await Role.findAll();
      ApiResponse(res, 'success', 200, 'Roles fetched successfully', roles);
    } catch (err) {
      ApiResponse(res, 'error', 500, err?.message || 'Failed to fetch roles', null, err);
    }
  },

  async createRole(req, res) {
    try {
      const role = await Role.create(req.body);
      ApiResponse(res, 'success', 201, 'Role created successfully', role);
    } catch (err) {
      ApiResponse(res, 'error', 500, err?.message || 'Failed to create role', null, {
        message: err.message,
      });
    }
  },

  async updateRole(req, res) {
    try {
      const role = await Role.findByPk(req.params.id);
      if (!role) {
        return ApiResponse(res, 'error', 404, 'Role not found');
      }
      await role.update(req.body);
      ApiResponse(res, 'success', 200, 'Role updated successfully', role);
    } catch (err) {
      ApiResponse(res, 'error', 500, err?.message || 'Failed to update role', null, {
        message: err.message,
      });
    }
  },

  async deleteRole(req, res) {
    try {
      const role = await Role.findByPk(req.params.id);
      if (!role) {
        return ApiResponse(res, 'error', 404, 'Role not found');
      }
      await role.destroy();
      ApiResponse(res, 'success', 200, 'Role deleted successfully');
    } catch (err) {
      ApiResponse(res, 'error', 500, err?.message || 'Failed to delete role', null, {
        message: err.message,
      });
    }
  },

  async getRoleById(req, res){
    try {
      const { id } = req.params;  // Get roleId from URL parameter (e.g., /get-role/:roleId)
  
      // Find the role by ID
      const role = await Role.findByPk(id);
      
      // If the role doesn't exist, return a 404 error
      if (!role) {
        return ApiResponse(res, 'error', 404, 'Role not found!')
      }
  
      // Return the role data in the response
      return ApiResponse(res, 'success', 200, 'Role fetched successfully!',)
    } catch (error) {
      console.error('Error retrieving role:', error);
      return ApiResponse(res, 'error', 500, error?.message || 'Failed to fetch role !')
    }
  }
};