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
 * Validates POST /api/v1/auth/login request body.
 *
 * Expected payload:
 * {
 *   username / identifier: string (3-50 characters),
 *   password: string (8-128 characters),
 *   captchaId / captchaToken: string (non-empty),
 *   captchaAnswer: string | number (non-empty)
 * }
 */
function validateLogin(req, res, next) {
  const unexpectedErrors = checkUnexpectedFields(req.body, [
    'username',
    'identifier',
    'password',
    'captchaId',
    'captchaAnswer',
    'captchaToken',
  ]);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

  const errors = [];
  const username = req.body && (req.body.username || req.body.identifier);
  const password = req.body && req.body.password;

  // Support captchaId directly, as captchaToken string, or within captchaToken object
  const captchaId =
    (req.body && req.body.captchaId) ||
    (req.body && typeof req.body.captchaToken === 'string' ? req.body.captchaToken : undefined) ||
    (req.body && req.body.captchaToken && req.body.captchaToken.id);

  const captchaAnswer =
    req.body && req.body.captchaAnswer !== undefined
      ? req.body.captchaAnswer
      : (req.body && req.body.captchaToken && req.body.captchaToken.answer);

  // Normalize back to req.body for downstream controller consistency
  if (req.body) {
    req.body.username = username;
    req.body.captchaId = captchaId;
    req.body.captchaAnswer = captchaAnswer;
  }

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
  const unexpectedErrors = checkUnexpectedFields(req.body, ['refreshToken']);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

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
  const unexpectedErrors = checkUnexpectedFields(req.body, ['refreshToken']);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return sendError(res, 400, 'Refresh token is required for logout.', [
      { field: 'refreshToken', message: 'Refresh token must be a non-empty string.' },
    ]);
  }
  return next();
}

/**
 * Validates POST /api/v1/auth/forgot-password request body.
 *
 * Expected payload:
 * {
 *   email?: string (valid email format),
 *   username?: string (3-50 chars),
 *   identifier?: string,
 *   captchaId?: string,
 *   captchaAnswer?: string | number,
 *   captchaToken?: object | string
 * }
 */
function validateForgotPassword(req, res, next) {
  const unexpectedErrors = checkUnexpectedFields(req.body, [
    'email',
    'username',
    'identifier',
    'captchaId',
    'captchaAnswer',
    'captchaToken',
  ]);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

  const errors = [];
  const { email, username, identifier } = req.body || {};

  if (email && username) {
    return sendError(res, 400, 'Please provide either email or username, not both.', [
      { field: 'identifier', message: 'Provide either email or username, not both.' },
    ]);
  }

  const target = email || username || identifier;

  if (!target || typeof target !== 'string' || target.trim() === '') {
    errors.push({
      field: 'identifier',
      message: 'An account identifier (email or username) is required.',
    });
  } else {
    const trimmed = target.trim();
    if (trimmed.includes('@')) {
      if (trimmed.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        errors.push({ field: 'email', message: 'A valid email address is required.' });
      }
    } else {
      if (trimmed.length < 3 || trimmed.length > 50) {
        errors.push({ field: 'username', message: 'Username must be between 3 and 50 characters.' });
      }
    }
  }

  // If CAPTCHA challenge is provided, validate answer
  const captchaId = req.body && (req.body.captchaId || (req.body.captchaToken && req.body.captchaToken.id));
  const captchaAnswer =
    req.body && (req.body.captchaAnswer !== undefined
      ? req.body.captchaAnswer
      : (req.body.captchaToken && req.body.captchaToken.answer));

  if (captchaId) {
    req.body.captchaId = captchaId;
    req.body.captchaAnswer = captchaAnswer;
    if (
      captchaAnswer === undefined ||
      captchaAnswer === null ||
      String(captchaAnswer).trim() === ''
    ) {
      errors.push({ field: 'captchaAnswer', message: 'CAPTCHA answer is required when challenge is provided.' });
    }
  }

  if (errors.length > 0) {
    return sendError(res, 400, 'Validation failed.', errors);
  }

  return next();
}

/**
 * Validates POST /api/v1/auth/reset-password request body.
 *
 * Expected payload:
 * {
 *   token: string (16-255 chars, reset token),
 *   newPassword: string (8-128 chars),
 *   confirmPassword?: string
 * }
 */
function validateResetPassword(req, res, next) {
  const unexpectedErrors = checkUnexpectedFields(req.body, [
    'token',
    'resetToken',
    'newPassword',
    'password',
    'confirmPassword',
  ]);
  if (unexpectedErrors.length > 0) {
    return sendError(res, 400, 'Validation failed.', unexpectedErrors);
  }

  const errors = [];
  const token = req.body && (req.body.token || req.body.resetToken);
  const newPassword = req.body && (req.body.newPassword || req.body.password);

  if (req.body) {
    req.body.token = token;
    req.body.newPassword = newPassword;
  }

  if (!token || typeof token !== 'string' || token.trim() === '') {
    errors.push({ field: 'token', message: 'Reset token is required.' });
  } else if (token.trim().length < 16 || token.trim().length > 255) {
    errors.push({ field: 'token', message: 'Reset token format is invalid.' });
  }

  if (!newPassword || typeof newPassword !== 'string') {
    errors.push({ field: 'newPassword', message: 'New password is required.' });
  } else if (newPassword.length < 8 || newPassword.length > 128) {
    errors.push({ field: 'newPassword', message: 'New password must be between 8 and 128 characters.' });
  }

  if (errors.length > 0) {
    return sendError(res, 400, 'Validation failed.', errors);
  }

  return next();
}

module.exports = {
  checkUnexpectedFields,
  validateLogin,
  validateRefresh,
  validateLogout,
  validateForgotPassword,
  validateResetPassword,
};


