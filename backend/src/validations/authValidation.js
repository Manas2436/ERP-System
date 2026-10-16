/**
 * backend/src/validations/authValidation.js
 *
 * Input validation middleware for authentication routes.
 *
 * Validates request payload structure, field types, required constraints,
 * and length limits to protect backend services from malformed or excessive inputs.
 */

'use strict';

const { error: sendError } = require('../utils/responseBuilder');

/**
 * Validates POST /api/v1/auth/login request body.
 *
 * Expected payload:
 * {
 *   username: string (3-50 characters),
 *   password: string (8-128 characters),
 *   captchaId: string (non-empty),
 *   captchaAnswer: string (non-empty)
 * }
 */
function validateLogin(req, res, next) {
  const errors = [];
  const { username, password } = req.body || {};

  // Support captchaId / captchaAnswer directly or within captchaToken object
  const captchaId = req.body.captchaId || (req.body.captchaToken && req.body.captchaToken.id);
  const captchaAnswer =
    req.body.captchaAnswer !== undefined
      ? req.body.captchaAnswer
      : (req.body.captchaToken && req.body.captchaToken.answer);

  // Normalize back to req.body for downstream controller consistency
  req.body.captchaId = captchaId;
  req.body.captchaAnswer = captchaAnswer;

  // 1. Username validation
  if (!username || typeof username !== 'string') {
    errors.push({ field: 'username', message: 'Username is required and must be a string.' });
  } else {
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      errors.push({ field: 'username', message: 'Username must be between 3 and 50 characters.' });
    }
  }

  // 2. Password validation
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required and must be a string.' });
  } else if (password.length < 8 || password.length > 128) {
    errors.push({ field: 'password', message: 'Password must be between 8 and 128 characters.' });
  }

  // 3. CAPTCHA ID validation
  if (!captchaId || typeof captchaId !== 'string' || captchaId.trim() === '') {
    errors.push({ field: 'captchaId', message: 'CAPTCHA challenge ID is required.' });
  }

  // 4. CAPTCHA Answer validation
  if (
    captchaAnswer === undefined ||
    captchaAnswer === null ||
    (typeof captchaAnswer !== 'string' && typeof captchaAnswer !== 'number') ||
    String(captchaAnswer).trim() === ''
  ) {
    errors.push({ field: 'captchaAnswer', message: 'CAPTCHA answer is required.' });
  }

  if (errors.length > 0) {
    return sendError(res, 400, 'Validation failed.', errors);
  }

  return next();
}

/**
 * Validates POST /api/v1/auth/refresh request body.
 *
 * Expected payload:
 * {
 *   refreshToken: string (non-empty)
 * }
 */
function validateRefresh(req, res, next) {
  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return sendError(res, 400, 'Refresh token is required.', [
      { field: 'refreshToken', message: 'Refresh token must be a non-empty string.' },
    ]);
  }
  return next();
}

/**
 * Validates POST /api/v1/auth/logout request body.
 *
 * Expected payload:
 * {
 *   refreshToken: string (non-empty)
 * }
 */
function validateLogout(req, res, next) {
  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return sendError(res, 400, 'Refresh token is required for logout.', [
      { field: 'refreshToken', message: 'Refresh token must be a non-empty string.' },
    ]);
  }
  return next();
}

module.exports = {
  validateLogin,
  validateRefresh,
  validateLogout,
};

