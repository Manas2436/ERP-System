/**
 * backend/src/controllers/authController.js
 *
 * Controller handling authentication endpoints (CAPTCHA generation and login).
 */

'use strict';

const { success: sendSuccess } = require('../utils/responseBuilder');
const { captchaService } = require('../services/captchaService');
const { authService } = require('../services/authService');

/**
 * GET /api/v1/auth/captcha
 * Generates a new single-use math/arithmetic CAPTCHA challenge.
 */
function getCaptcha(req, res, next) {
  try {
    const challenge = captchaService.createChallenge();
    return sendSuccess(res, 200, 'CAPTCHA challenge generated successfully.', challenge);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials with CAPTCHA verification and issues JWT tokens.
 */
async function login(req, res, next) {
  try {
    const { username, password, captchaId, captchaAnswer } = req.body;
    const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    const result = await authService.login({
      username,
      password,
      captchaId,
      captchaAnswer,
      clientIp,
    });

    return sendSuccess(res, 200, 'Login successful.', result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/refresh
 * Rotates an active refresh token and issues a replacement access token and refresh token.
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    const result = await authService.refresh({
      refreshToken,
      clientIp,
    });

    return sendSuccess(res, 200, 'Tokens refreshed successfully.', result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 * Revokes the supplied refresh token.
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    await authService.logout({
      refreshToken,
      clientIp,
    });

    return sendSuccess(res, 200, 'Logout successful. Session revoked.', null);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCaptcha,
  login,
  refresh,
  logout,
};

