/**
 * backend/src/routes/adminRoutes.js
 *
 * Administrative user-management routes.
 * Mounted under /api/v1/admin.
 *
 * All routes strictly require valid authentication (verifyToken)
 * and ADMIN role authorization (requireRole('ADMIN')).
 */

'use strict';

const { Router } = require('express');
const adminController = require('../controllers/adminController');
const {
  validateListUsers,
  validateCreateUser,
  validateUserId,
  validateUpdateRole,
  validateUpdateStatus,
} = require('../validations/adminValidation');
const verifyToken = require('../middleware/verifyToken');
const requireRole = require('../middleware/requireRole');
const { createRateLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Rate limiter for user provisioning: max 30 requests per 15 min per IP
const adminProvisionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many account creation requests from this IP. Please try again later.',
  skipInTest: true,
});

// Enforce authentication & ADMIN role globally across all admin routes
router.use(verifyToken);
router.use(requireRole('ADMIN'));

// ── GET /api/v1/admin/users ───────────────────────────────────────────────────
router.get('/users', validateListUsers, adminController.listUsers);

// ── POST /api/v1/admin/users ──────────────────────────────────────────────────
router.post('/users', adminProvisionLimiter, validateCreateUser, adminController.createUser);

// ── GET /api/v1/admin/users/:id ───────────────────────────────────────────────
router.get('/users/:id', validateUserId, adminController.getUserById);

// ── PUT /api/v1/admin/users/:id ───────────────────────────────────────────────
router.put('/users/:id', validateUserId, validateUpdateRole, adminController.updateUserRole);

// ── PATCH /api/v1/admin/users/:id/status ──────────────────────────────────────
router.patch('/users/:id/status', validateUserId, validateUpdateStatus, adminController.updateUserStatus);

module.exports = router;
