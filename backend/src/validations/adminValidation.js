/**
 * backend/src/validations/adminValidation.js
 *
 * Input validation middleware for admin user-management routes.
 * Validates request query parameters, body payloads, and path identifiers.
 */

'use strict';

const { error: sendError } = require('../utils/responseBuilder');

const ALLOWED_ROLES = new Set(['ADMIN', 'FACULTY', 'STUDENT']);

/**
 * Validates that an object contains only allowed property names and
 * does not contain dangerous prototype-polluting properties.
 *
 * @param {object} body
 * @param {string[]} allowedFields
 * @returns {Array<{ field: string, message: string }>}
 */
function checkUnexpectedFields(body, allowedFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const allowed = new Set(allowedFields);
  const errors = [];
  for (const key of Object.keys(body)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      errors.push({ field: key, message: `Prohibited property '${key}' is not allowed.` });
    } else if (!allowed.has(key)) {
      errors.push({ field: key, message: `Unexpected field '${key}' is not permitted.` });
    }
  }
  return errors;
}

/**
 * Validates GET /api/v1/admin/users query parameters.
 * Optional query params: page, pageSize, role, status, search
 */
function validateListUsers(req, res, next) {
  const errors = [];
  const { page, pageSize, role, status, search } = req.query;

  let parsedPage = 1;
  let parsedPageSize = 10;

  if (page !== undefined) {
    parsedPage = parseInt(page, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      errors.push({ field: 'page', message: 'Page must be a positive integer greater than or equal to 1.' });
    }
  }

  if (pageSize !== undefined) {
    parsedPageSize = parseInt(pageSize, 10);
    if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
      errors.push({ field: 'pageSize', message: 'PageSize must be an integer between 1 and 100.' });
    }
  }

  if (role !== undefined && role !== '') {
    const normalizedRole = String(role).toUpperCase().trim();
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      errors.push({ field: 'role', message: 'Role filter must be one of ADMIN, FACULTY, STUDENT.' });
    } else {
      req.query.role = normalizedRole;
    }
  }

  if (status !== undefined && status !== '') {
    const s = String(status).toLowerCase().trim();
    if (s !== 'active' && s !== 'inactive' && s !== '1' && s !== '0') {
      errors.push({ field: 'status', message: 'Status filter must be active, inactive, 1, or 0.' });
    }
  }

  if (search !== undefined && typeof search === 'string' && search.length > 100) {
    errors.push({ field: 'search', message: 'Search term cannot exceed 100 characters.' });
  }

  if (errors.length > 0) {
    return sendError(res, 400, 'Validation failed for user directory query parameters.', errors);
  }

  req.query.page = parsedPage;
  req.query.pageSize = parsedPageSize;
  return next();
}

/**
 * Validates POST /api/v1/admin/users body payload.
 * Expected payload:
 * {
 *   username: string (3-50 chars, alphanumeric + underscore),
 *   email: string (valid email format, max 100 chars),
 *   password: string (8-128 chars),
 *   role: 'ADMIN' | 'FACULTY' | 'STUDENT'
 * }
 */
function validateCreateUser(req, res, next) {
  const unexpectedErrors = checkUnexpectedFields(req.body, ['username', 'email', 'password', 'role']);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed for new user account creation.', unexpectedErrors);
  }

  const errors = [];
  const { username, email, password, role } = req.body || {};

  // 1. Username
  if (!username || typeof username !== 'string') {
    errors.push({ field: 'username', message: 'Username is required and must be a string.' });
  } else {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
      errors.push({ field: 'username', message: 'Username must be between 3 and 50 characters.' });
    } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      errors.push({ field: 'username', message: 'Username can only contain alphanumeric characters and underscores.' });
    }
  }

  // 2. Email
  if (!email || typeof email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required and must be a string.' });
  } else {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length < 5 || trimmedEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.push({ field: 'email', message: 'A valid email address (max 100 characters) is required.' });
    }
  }

  // 3. Password
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required and must be a string.' });
  } else if (password.length < 8 || password.length > 128) {
    errors.push({ field: 'password', message: 'Password must be between 8 and 128 characters.' });
  }

  // 4. Role
  if (!role || typeof role !== 'string') {
    errors.push({ field: 'role', message: 'Role is required and must be one of ADMIN, FACULTY, STUDENT.' });
  } else {
    const normalizedRole = role.toUpperCase().trim();
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      errors.push({ field: 'role', message: 'Invalid role. Allowed roles are ADMIN, FACULTY, STUDENT.' });
    } else {
      req.body.role = normalizedRole;
    }
  }

  if (errors.length > 0) {
    return sendError(res, 400, 'Validation failed for new user account creation.', errors);
  }

  return next();
}

/**
 * Validates route parameter :id as a positive integer.
 */
function validateUserId(req, res, next) {
  const rawId = req.params.id;
  const parsedId = parseInt(rawId, 10);

  if (isNaN(parsedId) || parsedId < 1 || String(parsedId) !== String(rawId).trim()) {
    return sendError(res, 400, 'Invalid user ID. Must be a positive integer.', [
      { field: 'id', message: 'User ID in route path must be a valid positive integer.' },
    ]);
  }

  req.params.parsedId = parsedId;
  return next();
}

/**
 * Validates PUT /api/v1/admin/users/:id body payload.
 * Expected payload:
 * {
 *   role: 'ADMIN' | 'FACULTY' | 'STUDENT'
 * }
 */
function validateUpdateRole(req, res, next) {
  const unexpectedErrors = checkUnexpectedFields(req.body, ['role']);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

  const { role } = req.body || {};

  if (!role || typeof role !== 'string') {
    return sendError(res, 400, 'Role is required and must be a string.', [
      { field: 'role', message: 'Role field is required.' },
    ]);
  }

  const normalizedRole = role.toUpperCase().trim();
  if (!ALLOWED_ROLES.has(normalizedRole)) {
    return sendError(res, 400, 'Invalid role specified.', [
      { field: 'role', message: 'Role must be one of ADMIN, FACULTY, STUDENT.' },
    ]);
  }

  req.body.role = normalizedRole;
  return next();
}

/**
 * Validates PATCH /api/v1/admin/users/:id/status body payload.
 * Expected payload:
 * {
 *   isActive: boolean | 1 | 0
 * }
 */
function validateUpdateStatus(req, res, next) {
  const unexpectedErrors = checkUnexpectedFields(req.body, ['isActive', 'is_active', 'status']);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

  const rawStatus =
    req.body?.isActive !== undefined ? req.body.isActive : req.body?.is_active;

  if (rawStatus === undefined || rawStatus === null) {
    return sendError(res, 400, 'Account status (isActive) is required.', [
      { field: 'isActive', message: 'isActive or is_active field is required.' },
    ]);
  }

  let normalizedStatus;
  if (rawStatus === true || rawStatus === 1 || rawStatus === '1' || rawStatus === 'true') {
    normalizedStatus = 1;
  } else if (rawStatus === false || rawStatus === 0 || rawStatus === '0' || rawStatus === 'false') {
    normalizedStatus = 0;
  } else {
    return sendError(res, 400, 'Invalid status value. Must be a boolean (true/false) or integer (1/0).', [
      { field: 'isActive', message: 'Status must be a boolean or 1/0.' },
    ]);
  }

  req.body.normalizedStatus = normalizedStatus;
  return next();
}

module.exports = {
  checkUnexpectedFields,
  validateListUsers,
  validateCreateUser,
  validateUserId,
  validateUpdateRole,
  validateUpdateStatus,
};
