/**
 * backend/src/routes/authRoutes.js
 *
 * Routes for authentication: CAPTCHA generation and user login.
 * Mounted under /api/v1/auth.
 */

'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const { validateLogin, validateRefresh, validateLogout } = require('../validations/authValidation');
const { createRateLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Rate limiters for authentication endpoints
const captchaLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,                   // 60 requests per 15 min per IP
  message: 'Too many CAPTCHA requests from this IP. Please try again later.',
  skipInTest: true,
});

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per 15 min per IP
  message: 'Too many login attempts from this IP. Please try again later.',
  skipInTest: true,
});

const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 refresh requests per 15 min per IP
  message: 'Too many token refresh attempts from this IP. Please try again later.',
  skipInTest: true,
});

const logoutLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 logout requests per 15 min per IP
  message: 'Too many logout requests from this IP. Please try again later.',
  skipInTest: true,
});

// ── GET /api/v1/auth/captcha ──────────────────────────────────────────────────
router.get('/captcha', captchaLimiter, authController.getCaptcha);

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────
router.post('/login', loginLimiter, validateLogin, authController.login);

// ── POST /api/v1/auth/refresh ──────────────────────────────────────────────────
router.post('/refresh', refreshLimiter, validateRefresh, authController.refresh);
router.post('/refresh-token', refreshLimiter, validateRefresh, authController.refresh);

// ── POST /api/v1/auth/logout ───────────────────────────────────────────────────
router.post('/logout', logoutLimiter, validateLogout, authController.logout);

module.exports = router;
