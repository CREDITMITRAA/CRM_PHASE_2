const jwt = require('jsonwebtoken')
const { ApiResponse } = require('../utilities/api-responses/ApiResponse')
require('dotenv').config()

function authenticate(allowedRoles = [], isPublic = false) {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            // If it's a public route and no token provided, skip verification
            if (isPublic) {
                return next();
            }

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return ApiResponse(res, 'error', 401, 'Un-Authorized!');
            }

            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.user.role)) {
                return ApiResponse(res, 'error', 403, 'Forbidden: Access denied for your role');
            }

            req.user = decoded; // Attach user details to request
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return ApiResponse(res, 'error', 401, 'Token expired, please log in again');
            } else {
                return ApiResponse(res, 'error', 401, 'Invalid Token!');
            }
        }
    };
}

module.exports = {
    authenticate
}