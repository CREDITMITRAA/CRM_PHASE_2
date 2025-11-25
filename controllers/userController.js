const { where, Op } = require("sequelize");
const { User, sequelize, Role, LeadAssignment, Activity, PhoneNumber } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const bcrypt = require("bcryptjs");
const { getPresignedUrlFromFullUrl } = require("../config/awsS3PresignedUrlConfig");

async function getAllUsers(req, res) {
  try {
    const {status='active'} = req.query
    const users = await User.findAll({
      include: [
        {
          model: PhoneNumber,
          as: 'phones',
          attributes: ['id', 'phone']
        }
      ],
      where: {
        status: status,
      },
    });
    ApiResponse(res, "success", 200, "Users fetched successfully", users);
  } catch (err) {
    ApiResponse(res, "error", 500, err?.message || "Failed to fetch users", null, {
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
    ApiResponse(res, "error", 500, err?.message || "Failed to fetch user", null, {
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
      date_of_join,
      phones
    } = req.body;

    // Validation: Check if all required fields are provided
    if (!employee_id || !name || !email || !password || !designation || !role_name || !date_of_join) {
      await t.rollback()
      return ApiResponse(res, "error", 400, "Missing required fields");
    }

    if(!phones || !Array.isArray(phones) || phones.length === 0){
      await t.rollback()
      return ApiResponse(res, "ERROR", 400, "At least one phone number is required")
    }

    for(let phoneObj of phones){
      if(!phoneObj.phone || phoneObj.phone.trim() === ''){
        await t.rollback()
        return ApiResponse(res, "ERROR", 400, "Phone number cannot be empty")
      }
    }

    // Check if email already exists
    const existingUser = await User.findOne({ 
      where: { email },
      transaction: t 
    });
    
    if (existingUser) {
      await t.rollback();
      return ApiResponse(res, "error", 400, "Email already exists");
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
        // phone,
        address,
        password: hashedPassword,
        salary,
        designation,
        department,
        working_mode,
        status: status || "active", // Default status to 'active' if not provided
        role_id: role.id, // Assign the role_id to the user
        date_of_join
      },
      { transaction: t }
    );

    // create phone number records 
    const phonePromises = phones.map((phoneObj, index) =>
      PhoneNumber.create({
        phone: phoneObj.phone,
        user_id: user.id
      }, {transaction:t})
    )

    await Promise.all(phonePromises)

    // fetch the complete user with phones to return in response
    const createdUser = await User.findByPk(user.id, {
      include: [
        {
          model: PhoneNumber,
          as: 'phones',
          attributes: ['id', 'phone']
        },
        // {
        //   model: Role,
        //   as: 'role',
        //   attributes: ['id', 'role_name']
        // }
      ],
      attributes: {exclude: ['password']},
      transaction: t
    })

    // Commit the transaction to persist all changes
    await t.commit();

    // Return success response with the created user
    return ApiResponse(res, "success", 201, "User created successfully", createdUser);
  } catch (error) {
    // Rollback the transaction in case of any error
    await t.rollback();

    console.error("Error creating user:", error);

    // Handle specific errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return ApiResponse(res, "error", 400, "Email already exists");
    }

    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to create user!",
      null,
      error,
      null
    );
  }
}

async function updateUser(req, res) {
  const t = await sequelize.transaction();
  
  try {
    const user = await User.findByPk(req.params.id, {
      transaction: t
    });
    
    if (!user) {
      await t.rollback();
      return ApiResponse(res, "error", 404, "User not found");
    }

    const { phones, role_name, password, ...userData } = req.body;

    // Update role if provided
    if (role_name) {
      const role = await Role.findOne(
        { where: { role_name: role_name } },
        { transaction: t }
      );
      
      if (!role) {
        await t.rollback();
        return ApiResponse(res, "error", 404, "Role not found");
      }
      userData.role_id = role.id;
    }

    // Hash password if provided
    if (password) {
      const salt = await bcrypt.genSalt(12);
      userData.password = await bcrypt.hash(password, salt);
    }

    // Update user
    await user.update(userData, { transaction: t });

    // Update phones if provided
    if (phones && Array.isArray(phones)) {
      // Validate phones array
      const validPhones = phones.filter(phoneObj => phoneObj.phone && phoneObj.phone.trim() !== '');
      
      if (validPhones.length === 0) {
        await t.rollback();
        return ApiResponse(res, "error", 400, "At least one valid phone number is required");
      }

      // Remove existing phones
      await PhoneNumber.destroy({
        where: { user_id: user.id },
        transaction: t
      });

      // Create new phones
      const phonePromises = validPhones.map((phoneObj, index) =>
        PhoneNumber.create({
          phone: phoneObj.phone,
          user_id: user.id
        }, { transaction: t })
      );

      await Promise.all(phonePromises);
    }

    // Fetch updated user with phones
    const updatedUser = await User.findByPk(user.id, {
      include: [
        {
          model: PhoneNumber,
          as: 'phones',
          attributes: ['id', 'phone']
        },
      ],
      attributes: { exclude: ['password'] },
      transaction: t
    });

    await t.commit();
    
    ApiResponse(res, "success", 200, "User updated successfully", updatedUser);
  } catch (err) {
    await t.rollback();
    console.error("Error updating user:", err);
    
    if (err.name === 'SequelizeUniqueConstraintError') {
      return ApiResponse(res, "error", 400, "Email already exists");
    }
    
    ApiResponse(res, "error", 500, err?.message || "Failed to update user", null, {
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
      await t.rollback()
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
      err?.message || "Failed to mark user and associated records as inactive",
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
      return ApiResponse(res, 'error', 500, error?.message || "Failed to fetch users with matching name !", null, error, null)
  }
}

async function getUsersNameAndId(req, res) {
  try {
    const { status } = req.query
    const whereConditions = {}

    if(status){
      whereConditions.status = status;
    }

    const users = await User.findAll({
      attributes: ['id', 'name', 'role_id', 'profile_image_url', 'status'],
      where: whereConditions
    });

    // Convert to plain objects and generate presigned URLs
    const processedUsers = await Promise.all(
      users.map(async (user) => {
        const userData = user.get ? user.get({ plain: true }) : user;
        
        // Generate presigned URL for profile_image_url
        if (userData.profile_image_url) {
          try {
            const presignedUrl = await getPresignedUrlFromFullUrl(userData.profile_image_url);
            if (presignedUrl) {
              // Replace the original URL with presigned URL
              userData.profile_image_url = presignedUrl;
            }
          } catch (error) {
            console.error('Error generating presigned URL for user profile image:', error);
            // Keep original URL if presigned URL generation fails
          }
        }
        
        return userData;
      })
    );

    ApiResponse(res, "success", 200, "Users fetched successfully", processedUsers);
  } catch (err) {
    ApiResponse(res, "error", 500, err?.message || "Failed to fetch users", null, {
      message: err.message,
    });
  }
}

async function updateProfileImageUrl(req, res) {
  try {
    const {userId} = req.params; // Assuming the `authenticate()` middleware sets req.user
    const { profile_image_url } = req.body;
    console.log('user id = ', userId, 'url = ', profile_image_url);
    
    if (!profile_image_url) {
      return ApiResponse(res, "error", 400, "Profile image URL is required", null, "Missing field", null);
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return ApiResponse(res, "error", 404, "User not found", null, null, null);
    }

    user.profile_image_url = profile_image_url;
    await user.save();

    return ApiResponse(res, "success", 200, "Profile image URL updated successfully", profile_image_url, null, null);
  } catch (error) {
    return ApiResponse(res, "error", 500, error?.message || "Failed to update profile image URL", null, error.message, null);
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUserByUserId,
  getUsersByName,
  getUsersNameAndId,
  updateProfileImageUrl
};
