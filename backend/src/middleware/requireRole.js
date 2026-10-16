/**
 * backend/src/middleware/requireRole.js
 *
 * Role-Based Access Control (RBAC) middleware factory.
 *
 * Returns an Express middleware function that enforces that the authenticated
 * user holds one of the specified allowed roles.
 *
 * MUST be used AFTER verifyToken, which populates req.user.
 *
 * Allowed roles in this system: 'ADMIN', 'FACULTY', 'STUDENT'
 * Unknown roles are rejected at both the token-verification layer (verifyToken)
 * and here as a defense-in-depth measure.
 *
 * Usage:
 *   const requireRole = require('../middleware/requireRole');
 *   router.get('/admin-only', verifyToken, requireRole('ADMIN'), handler);
 *   router.get('/staff', verifyToken, requireRole('ADMIN', 'FACULTY'), handler);
 *
 * Error responses:
 *   401  — verifyToken was not called first (req.user is absent)
 *   403  — authenticated but role is not in the allowed list
 */

'use strict';

const { error: sendError } = require('../utils/responseBuilder');
const logger               = require('../utils/logger');

const ALLOWED_ROLES = new Set(['ADMIN', 'FACULTY', 'STUDENT']);

/**
 * Middleware factory that restricts access to users with specified roles.
 *
 * @param {...string} roles  One or more allowed role strings.
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  // Validate at middleware-registration time (startup) — fail fast on typos.
  if (roles.length === 0) {
    throw new Error('requireRole: at least one role must be specified.');
  }
  for (const role of roles) {
    if (!ALLOWED_ROLES.has(role)) {
      throw new Error(
        `requireRole: '${role}' is not a recognized role. ` +
        `Allowed roles: ${[...ALLOWED_ROLES].join(', ')}.`
      );
    }
  }

  const allowedSet = new Set(roles);

  return function roleGuard(req, res, next) {
    // Guard: verifyToken must run first
    if (!req.user || !req.user.role) {
      logger.warn('requireRole called without verifyToken having set req.user', {
        url: req.originalUrl,
      });
      return sendError(res, 401, 'Authentication required.');
    }

    if (!allowedSet.has(req.user.role)) {
      logger.warn('Access denied — insufficient role', {
        userId    : req.user.id,
        userRole  : req.user.role,
        required  : [...allowedSet],
        url       : req.originalUrl,
      });
      return sendError(
        res,
        403,
        'You do not have permission to access this resource.'
      );
    }

    return next();
  };
}

module.exports = requireRole;
