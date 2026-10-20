/**
 * backend/src/services/adminService.js
 *
 * Business logic and database operations for Admin User Management.
 * Uses vw_user_summary for safe user projections, sp_create_user for provisioning,
 * sp_update_user_role for role modification, and sp_update_user_status for status toggles.
 */

'use strict';

const pool = require('../config/db');
const { hashPassword } = require('../utils/password');
const logger = require('../utils/logger');

class AdminService {
  /**
   * Retrieve a paginated directory of users with optional filtering.
   *
   * @param {{ page: number, pageSize: number, role?: string, status?: string, search?: string }} options
   * @returns {Promise<{ users: Array, pagination: object }>}
   */
  async getUsers({ page = 1, pageSize = 10, role, status, search }) {
    const whereClauses = [];
    const params = [];

    if (role) {
      whereClauses.push('`role` = ?');
      params.push(role);
    }

    if (status !== undefined && status !== '') {
      const activeFlag = status === 'active' || status === '1' ? 1 : 0;
      whereClauses.push('`is_active` = ?');
      params.push(activeFlag);
    }

    if (search) {
      whereClauses.push('(`username` LIKE ? OR `email` LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Get total matching count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM \`vw_user_summary\` ${whereSql}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // 2. Query paginated slice (ensure numeric types for MySQL LIMIT/OFFSET)
    const numPage = Math.max(1, parseInt(page, 10) || 1);
    const numPageSize = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 10));
    const offset = (numPage - 1) * numPageSize;
    const queryParams = [...params, numPageSize, offset];

    const [users] = await pool.query(
      `SELECT
        \`id\`,
        \`username\`,
        \`email\`,
        \`role\`,
        \`is_active\`,
        \`failed_login_attempts\`,
        \`locked_until\`,
        \`last_login_at\`,
        \`created_by\`,
        \`created_at\`,
        \`updated_at\`
      FROM \`vw_user_summary\`
      ${whereSql}
      ORDER BY \`id\` DESC
      LIMIT ? OFFSET ?`,
      queryParams
    );

    const totalPages = Math.ceil(total / numPageSize) || 1;

    return {
      users,
      pagination: {
        page: numPage,
        pageSize: numPageSize,
        total,
        totalPages,
        hasNext: numPage < totalPages,
        hasPrev: numPage > 1,
      },
    };
  }

  /**
   * Provision a new user account.
   *
   * @param {{ username: string, email: string, password: string, role: string, adminId: number }} payload
   * @returns {Promise<object>} Created safe user record.
   */
  async createUser({ username, email, password, role, adminId }) {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Check unique username
    const [existingUsername] = await pool.query(
      'SELECT `id` FROM `users` WHERE `username` = ? LIMIT 1',
      [normalizedUsername]
    );
    if (existingUsername.length > 0) {
      const err = new Error('Username is already taken.');
      err.status = 409;
      err.code = 'USERNAME_TAKEN';
      throw err;
    }

    // Check unique email
    const [existingEmail] = await pool.query(
      'SELECT `id` FROM `users` WHERE `email` = ? LIMIT 1',
      [normalizedEmail]
    );
    if (existingEmail.length > 0) {
      const err = new Error('Email is already registered.');
      err.status = 409;
      err.code = 'EMAIL_TAKEN';
      throw err;
    }

    // Hash password with standard bcryptjs utility
    const passwordHash = await hashPassword(password);

    // Call stored procedure sp_create_user
    const [spResult] = await pool.query(
      'CALL `sp_create_user`(?, ?, ?, ?, ?, @out_user_id)',
      [normalizedUsername, normalizedEmail, passwordHash, role, adminId]
    );

    // Read generated user_id from result set or OUT variable
    let newUserId = spResult[0]?.[0]?.user_id;
    if (!newUserId) {
      const [outRows] = await pool.query('SELECT @out_user_id AS `user_id`');
      newUserId = outRows[0]?.user_id;
    }

    if (!newUserId) {
      throw new Error('User provisioning failed: no user ID returned from stored procedure.');
    }

    logger.info('User account successfully provisioned by administrator', {
      createdUserId: newUserId,
      role,
      adminId,
    });

    // Query safe user summary from view
    const [createdRows] = await pool.query(
      `SELECT
        \`id\`,
        \`username\`,
        \`email\`,
        \`role\`,
        \`is_active\`,
        \`failed_login_attempts\`,
        \`locked_until\`,
        \`last_login_at\`,
        \`created_by\`,
        \`created_at\`,
        \`updated_at\`
      FROM \`vw_user_summary\`
      WHERE \`id\` = ?`,
      [newUserId]
    );

    return createdRows[0];
  }

  /**
   * Retrieve a safe user profile by ID.
   *
   * @param {number} id
   * @returns {Promise<object>}
   */
  async getUserById(id) {
    const [rows] = await pool.query(
      `SELECT
        \`id\`,
        \`username\`,
        \`email\`,
        \`role\`,
        \`is_active\`,
        \`failed_login_attempts\`,
        \`locked_until\`,
        \`last_login_at\`,
        \`created_by\`,
        \`created_at\`,
        \`updated_at\`
      FROM \`vw_user_summary\`
      WHERE \`id\` = ?`,
      [id]
    );

    if (rows.length === 0) {
      const err = new Error('User not found.');
      err.status = 404;
      throw err;
    }

    return rows[0];
  }

  /**
   * Update a user's role.
   *
   * @param {{ id: number, role: string, currentAdminId: number|string }} payload
   * @returns {Promise<object>} Updated safe user record.
   */
  async updateUserRole({ id, role, currentAdminId }) {
    // 1. Verify user exists
    const [targetRows] = await pool.query(
      'SELECT `id`, `role`, `is_active` FROM `users` WHERE `id` = ?',
      [id]
    );
    if (targetRows.length === 0) {
      const err = new Error('User not found.');
      err.status = 404;
      throw err;
    }

    const targetUser = targetRows[0];

    // 2. Prevent administrator from demoting their own account
    if (parseInt(currentAdminId, 10) === parseInt(id, 10) && role !== 'ADMIN') {
      const err = new Error('Administrators cannot demote their own account role.');
      err.status = 400;
      throw err;
    }

    // 3. Prevent demoting the only active administrator
    if (targetUser.role === 'ADMIN' && role !== 'ADMIN' && targetUser.is_active === 1) {
      const [adminCountRows] = await pool.query(
        "SELECT COUNT(*) AS `count` FROM `users` WHERE `role` = 'ADMIN' AND `is_active` = 1"
      );
      const activeAdminCount = adminCountRows[0]?.count || 0;
      if (activeAdminCount <= 1) {
        const err = new Error('Cannot change the role of the only active administrator.');
        err.status = 400;
        throw err;
      }
    }

    // 4. Call stored procedure sp_update_user_role
    await pool.query('CALL `sp_update_user_role`(?, ?)', [id, role]);

    logger.info('User role updated by administrator', {
      targetUserId: id,
      newRole: role,
      adminId: currentAdminId,
    });

    // 5. Return updated safe user summary
    return this.getUserById(id);
  }

  /**
   * Activate or deactivate a user account.
   * On deactivation, active refresh-token sessions are immediately revoked.
   *
   * @param {{ id: number, isActive: number, currentAdminId: number|string }} payload
   * @returns {Promise<object>} Updated safe user record.
   */
  async updateUserStatus({ id, isActive, currentAdminId }) {
    // 1. Verify user exists
    const [targetRows] = await pool.query(
      'SELECT `id`, `role`, `is_active` FROM `users` WHERE `id` = ?',
      [id]
    );
    if (targetRows.length === 0) {
      const err = new Error('User not found.');
      err.status = 404;
      throw err;
    }

    const targetUser = targetRows[0];

    // 2. Prevent administrator from deactivating their own account
    if (parseInt(currentAdminId, 10) === parseInt(id, 10) && isActive === 0) {
      const err = new Error('Administrators cannot deactivate their own account.');
      err.status = 400;
      throw err;
    }

    // 3. Prevent deactivating the only active administrator
    if (isActive === 0 && targetUser.role === 'ADMIN' && targetUser.is_active === 1) {
      const [adminCountRows] = await pool.query(
        "SELECT COUNT(*) AS `count` FROM `users` WHERE `role` = 'ADMIN' AND `is_active` = 1"
      );
      const activeAdminCount = adminCountRows[0]?.count || 0;
      if (activeAdminCount <= 1) {
        const err = new Error('Cannot deactivate the only active administrator.');
        err.status = 400;
        throw err;
      }
    }

    // 4. Call stored procedure sp_update_user_status
    await pool.query('CALL `sp_update_user_status`(?, ?)', [id, isActive]);

    // 5. If deactivating, revoke all active refresh-token sessions in the database
    if (isActive === 0) {
      await pool.query(
        'UPDATE `refresh_tokens` SET `is_revoked` = 1, `revoked_at` = NOW() WHERE `user_id` = ? AND `is_revoked` = 0',
        [id]
      );
      logger.info('Active refresh token sessions revoked for deactivated user', {
        userId: id,
        adminId: currentAdminId,
      });
    }

    logger.info('User account status updated by administrator', {
      targetUserId: id,
      newStatus: isActive,
      adminId: currentAdminId,
    });

    // 6. Return updated safe user summary
    return this.getUserById(id);
  }
}

module.exports = new AdminService();
