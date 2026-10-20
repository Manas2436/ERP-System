/**
 * shared/middleware/index.js
 *
 * Canonical shared middleware entry point for cross-module ERP integration.
 * Allows other ERP modules (e.g. Student Management, Faculty Management,
 * Attendance, Course Management, Examination, Fees) in the monorepo to import
 * authentication and authorization guards without tight coupling to backend internals.
 *
 * Design Guarantees:
 * - Pure middleware functions: verifyToken & requireRole.
 * - Zero side effects: does NOT import server.js, app.js, or initialize the DB pool.
 * - Independent verification: uses JWT_SECRET to verify tokens locally in-process.
 *
 * Usage:
 *   const { verifyToken, requireRole, ALLOWED_ROLES } = require('../../shared/middleware');
 *   // Or when imported from repository root:
 *   const { verifyToken, requireRole } = require('./shared/middleware');
 *
 * Example:
 *   router.get(
 *     '/api/v1/attendance/report',
 *     verifyToken,
 *     requireRole('FACULTY', 'ADMIN'),
 *     attendanceController.getReport
 *   );
 */

'use strict';

const {
  verifyToken,
  requireRole,
  ALLOWED_ROLES,
} = require('../../backend/src/middleware');

module.exports = {
  verifyToken,
  requireRole,
  ALLOWED_ROLES,
};
