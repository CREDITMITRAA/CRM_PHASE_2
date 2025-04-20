const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');  // Assuming your User model is in the 'models' folder
const { ApiResponse } = require('../utilities/api-responses/ApiResponse');

async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validation: Ensure email and password are provided
    if (!email || !password) {
      return ApiResponse(res, 'error', 400, "Missing required fields!");
    }

    // Check if the user exists with the given email
    const user = await User.findOne({ 
      where: { email },
      include: { model: Role, as: 'Role' } 
    });

    if (!user) {
      return ApiResponse(res, 'error', 400, 'User not found!');
    }

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return ApiResponse(res, 'error', 400, "Invalid Credentials!");
    }

    // Get the previous last_login_at before updating
    const previousLastLogin = user.last_login_at;
    const currentTime = new Date();

    // Calculate time difference (in days/hours) since last login
    let lastLoginAgo = null;
    if (previousLastLogin) {
      const diffInMs = currentTime - previousLastLogin;
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

      if (diffInDays > 0) {
        lastLoginAgo = `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
      } else if (diffInHours > 0) {
        lastLoginAgo = `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
      } else {
        lastLoginAgo = "less than an hour ago";
      }
    } else {
      lastLoginAgo = "first login"; // If no previous login exists
    }

    // Update user's login status and last login time
    await user.update({
      login_status: 'logged_in',
      last_login_at: currentTime
    });

    const roleName = user.Role ? user.Role.role_name : null;
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name ? user.name : null,
      role: roleName,
      department: user.department ? user.department : null,
      designation: user.designation ? user.designation : null,
      profile_image_url: user.profile_image_url ? user.profile_image_url : null,
      employee_id: user.employee_id,
      last_login_at: currentTime, // New last_login_at
      last_login_ago: lastLoginAgo // Time since previous login (e.g., "5 days ago")
    };

    // Generate JWT token
    const token = jwt.sign({ user: userData }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRY,
    });

    // Send the JWT token in the response
    return res.status(200).json({ 
      token,
      last_login_ago: lastLoginAgo // Optional: Also send it directly in response
    });
  } catch (error) {
    console.error('Error during login:', error);
    return ApiResponse(res, 'error', 500, 'Failed to login!', null, error, null);
  }
}

async function updatePassword(req, res) {
  try {
    const { userId, oldPassword, newPassword, renteredNewPassword } = req.body;

    // Check for missing fields
    if (!userId || !oldPassword || !newPassword || !renteredNewPassword) {
      return ApiResponse(res, "error", 400, "Missing required fields!");
    }

    // Fetch user from database
    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
      return ApiResponse(res, "error", 404, "User not found!");
    }

    // Check if old password matches
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return ApiResponse(res, "error", 400, "Old password is incorrect!");
    }

    // Validate new password match
    if (newPassword !== renteredNewPassword) {
      return ApiResponse(res, "error", 400, "New passwords do not match!");
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await user.update({ password: hashedPassword });

    return ApiResponse(res, "success", 200, "Password updated successfully!", {password:hashedPassword});

  } catch (error) {
    return ApiResponse(res, "error", 500, "Failed to update password!", null, error, null);
  }
}

async function logout(req, res) {
  try {
    // 1. Extract token from headers
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return ApiResponse(res, 'error', 401, "No token provided!");
    }

    // 2. Verify token and get user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id;

    // 3. Update BOTH login_status AND last_login_at
    await User.update(
      {
        login_status: 'logged_out',
        last_login_at: new Date() // Updates to current logout time
      },
      { where: { id: userId } }
    );

    // (Optional) Token invalidation for security
    // await TokenBlacklist.create({ token });

    return ApiResponse(res, 'success', 200, "Logged out successfully!");
  } catch (error) {
    console.error('Error during logout:', error);
    return ApiResponse(res, 'error', 500, "Logout failed!", null, error);
  }
}

// async function refresh(req,res){
//   const { token } = req.body;
//     try {
//         const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });

//         const newToken = jwt.sign(
//             { id: decoded.id, name: decoded.name, role: decoded.role },
//             process.env.JWT_SECRET,
//             { expiresIn: process.env.JWT_EXPIRY }
//         );

//         return ApiResponse.success(res, 200, 'Token refreshed', { token: newToken });
//     } catch (error) {
//         return ApiResponse.error(res, 401, 'Invalid refresh token');
//     }
// }

module.exports = { login, updatePassword, logout };