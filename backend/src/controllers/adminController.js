/**
 * backend/src/controllers/adminController.js
 *
 * Controller handlers for administrative user management routes.
 * Strictly mounted behind verifyToken and requireRole('ADMIN').
 */

'use strict';

const adminService = require('../services/adminService');
const { success: sendSuccess, error: sendError } = require('../utils/responseBuilder');
const logger = require('../utils/logger');

/**
 * GET /api/v1/admin/users
 * Retrieve paginated user directory.
 */
async function listUsers(req, res) {
  try {
    const { page, pageSize, role, status, search } = req.query;
    const result = await adminService.getUsers({
      page,
      pageSize,
      role,
      status,
      search,
    });
    return sendSuccess(res, 200, 'User directory retrieved successfully.', result);
  } catch (err) {
    logger.error('Failed to list user directory', { message: err.message });
    return sendError(res, err.status || 500, err.message || 'Failed to retrieve user directory.');
  }
}

/**
 * POST /api/v1/admin/users
 * Provision new user account.
 */
async function createUser(req, res) {
  try {
    const { username, email, password, role } = req.body;
    const adminId = req.user.id;

    const user = await adminService.createUser({
      username,
      email,
      password,
      role,
      adminId,
    });

    return sendSuccess(res, 201, 'User account created successfully.', { user });
  } catch (err) {
    if (err.status === 409) {
      return sendError(res, 409, err.message, [{ field: err.code === 'USERNAME_TAKEN' ? 'username' : 'email', message: err.message }]);
    }
    logger.error('Failed to provision user', { message: err.message });
    return sendError(res, err.status || 500, err.message || 'Failed to create user account.');
  }
}

/**
 * GET /api/v1/admin/users/:id
 * Retrieve safe user profile by ID.
 */
async function getUserById(req, res) {
  try {
    const id = req.params.parsedId;
    const user = await adminService.getUserById(id);
    return sendSuccess(res, 200, 'User profile retrieved successfully.', { user });
  } catch (err) {
    if (err.status === 404) {
      return sendError(res, 404, 'User not found.');
    }
    logger.error('Failed to get user profile', { id: req.params.parsedId, message: err.message });
    return sendError(res, err.status || 500, err.message || 'Failed to retrieve user profile.');
  }
}

/**
 * PUT /api/v1/admin/users/:id
 * Update user role.
 */
async function updateUserRole(req, res) {
  try {
    const id = req.params.parsedId;
    const { role } = req.body;
    const currentAdminId = req.user.id;

    const user = await adminService.updateUserRole({
      id,
      role,
      currentAdminId,
    });

    return sendSuccess(res, 200, 'User role updated successfully.', { user });
  } catch (err) {
    if (err.status === 404) {
      return sendError(res, 404, 'User not found.');
    }
    if (err.status === 400) {
      return sendError(res, 400, err.message);
    }
    logger.error('Failed to update user role', { id: req.params.parsedId, message: err.message });
    return sendError(res, err.status || 500, err.message || 'Failed to update user role.');
  }
}

/**
 * PATCH /api/v1/admin/users/:id/status
 * Activate or deactivate account (and revoke sessions if deactivated).
 */
async function updateUserStatus(req, res) {
  try {
    const id = req.params.parsedId;
    const isActive = req.body.normalizedStatus;
    const currentAdminId = req.user.id;

    const user = await adminService.updateUserStatus({
      id,
      isActive,
      currentAdminId,
    });

    const message =
      isActive === 1
        ? 'User account activated successfully.'
        : 'User account deactivated and active sessions revoked.';

    return sendSuccess(res, 200, message, { user });
  } catch (err) {
    if (err.status === 404) {
      return sendError(res, 404, 'User not found.');
    }
    if (err.status === 400) {
      return sendError(res, 400, err.message);
    }
    logger.error('Failed to update user status', { id: req.params.parsedId, message: err.message });
    return sendError(res, err.status || 500, err.message || 'Failed to update user status.');
  }
}

module.exports = {
  listUsers,
  createUser,
  getUserById,
  updateUserRole,
  updateUserStatus,
};
