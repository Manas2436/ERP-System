/**
 * backend/src/middleware/index.js
 *
 * Central export hub for middleware in the College ERP Authentication Module.
 * Exposes stable, reusable middleware for use within this module and by
 * external ERP modules (e.g., Attendance, Courses, Examination, Fees).
 *
 * Importing from this entry point has NO side effects:
 * - Does NOT import app.js or server.js
 * - Does NOT initialize the database connection pool
 * - Does NOT bind to any network port
 *
 * Usage:
 *   const { verifyToken, requireRole, ALLOWED_ROLES } = require('../middleware');
 */

'use strict';

const verifyToken = require('./verifyToken');
const requireRole = require('./requireRole');
const { createRateLimiter } = require('./rateLimiter');
const errorHandler = require('./errorHandler');
const notFound = require('./notFound');

const ALLOWED_ROLES = Object.freeze(['ADMIN', 'FACULTY', 'STUDENT']);

module.exports = {
  verifyToken,
  requireRole,
  createRateLimiter,
  errorHandler,
  notFound,
  ALLOWED_ROLES,
};
