const { where, Op } = require("sequelize");
const { User, sequelize, Role, LeadAssignment, Activity } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const bcrypt = require("bcryptjs");

async function getAllUsers(req, res) {
  try {
    const users = await User.findAll({
      where: {
        status: 'active',
      },
    });
    ApiResponse(res, "success", 200, "Users fetched successfully", users);
  } catch (err) {
    ApiResponse(res, "error", 500, "Failed to fetch users", null, {
      message: err.message,
    });
  }
}

async function getUserById(req, res) {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        {
          model: Role,
          as: "Role",
          attributes: ["id", "role_name"], // Specify Role attributes to include
        },
      ],
    });

    if (!user) {
      return ApiResponse(res, "error", 404, "User not found");
    }

    ApiResponse(res, "success", 200, "User fetched successfully", user);
  } catch (err) {
    ApiResponse(res, "error", 500, "Failed to fetch user", null, {
      message: err.message,
    });
  }
}

async function createUser(req, res) {
  const t = await sequelize.transaction(); // Start a transaction

  try {
    const {
      employee_id,
      name,
      email,
      phone,
      address,
      password,
      salary,
      designation,
      department,
      working_mode,
      status,
      role_name,
    } = req.body;

    // Validation: Check if all required fields are provided
    if (!name || !email || !password || !role_name) {
      return ApiResponse(res, "error", 400, "Missing required fields");
    }

    // Fetch the role ID for the role name (e.g., 'admin')
    const role = await Role.findOne(
      { where: { role_name: role_name } },
      { transaction: t }
    );

    if (!role) {
      // Rollback the transaction if the role is not found
      await t.rollback();
      return ApiResponse(res, "error", 404, "Role not found");
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create a new user with role_id directly in the User table
    const user = await User.create(
      {
        employee_id,
        name,
        email,
        phone,
        address,
        password: hashedPassword,
        salary,
        designation,
        department,
        working_mode,
        status: status || "active", // Default status to 'active' if not provided
        role_id: role.id, // Assign the role_id to the user
      },
      { transaction: t }
    );

    // Commit the transaction to persist all changes
    await t.commit();

    // Return success response with the created user
    return ApiResponse(res, "success", 201, "User created successfully", user);
  } catch (error) {
    // Rollback the transaction in case of any error
    await t.rollback();

    console.error("Error creating user:", error);
    return ApiResponse(
      res,
      "error",
      500,
      "Failed to create user!",
      null,
      error,
      null
    );
  }
}

async function updateUser(req, res) {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return ApiResponse(res, "error", 404, "User not found");
    }

    // Check if the password field is in the request body
    if (req.body.password) {
      // Hash the new password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(req.body.password, salt);
      req.body.password = hashedPassword;
    }

    // Update user with the rest of the fields
    await user.update(req.body);

    ApiResponse(res, "success", 200, "User updated successfully", user);
  } catch (err) {
    ApiResponse(res, "error", 500, "Failed to update user", null, {
      message: err.message,
    });
  }
}

const deleteUserByUserId = async (req, res) => {
  const t = await sequelize.transaction()

  try {
    const userId = req.params.id;

    // Check if the user exists
    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      return ApiResponse(res, "error", 404, "User not found");
    }

    // Soft delete user
    user.status = "inactive";
    await user.save({ transaction: t });

    // Soft delete associated lead assignments
    await LeadAssignment.update(
      { status: "inactive" },
      { where: { assigned_to: userId }, transaction: t }
    );

    // Soft delete associated activities
    await Activity.update(
      { status: "inactive" },
      { where: { created_by: userId }, transaction: t }
    );

    // Commit the transaction
    await t.commit();

    ApiResponse(
      res,
      "success",
      200,
      "User and associated records marked as inactive successfully"
    );
  } catch (err) {
    // Rollback the transaction if any error occurs
    await t.rollback();

    ApiResponse(
      res,
      "error",
      500,
      "Failed to mark user and associated records as inactive",
      null,
      err,
      null
    );
  }
};

async function getUsersByName(req,res){
  try {
    console.log('request received');
    
    const {name} = req.query
    if(!name){
      return ApiResponse(res, 'error', 400, "Missing required fields !")
    }

    const users = await User.findAll({
      attributes: ["id","name"],
      where:{
        name:{
          [Op.like] : `%${name}%`
        }
      }
    })

    return ApiResponse(res,'success', 200, "Users with matching name fetch successfully", users, null,null)
  } catch (error) {
      console.log(error);
      return ApiResponse(res, 'error', 500, "Failed to fetch users with matching name !", null, error, null)
  }
}

async function getUsersNameAndId(req, res) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'role_id'],
      where: {
        status: 'active',
      },
    });
    ApiResponse(res, "success", 200, "Users fetched successfully", users);
  } catch (err) {
    ApiResponse(res, "error", 500, "Failed to fetch users", null, {
      message: err.message,
    });
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUserByUserId,
  getUsersByName,
  getUsersNameAndId
};
