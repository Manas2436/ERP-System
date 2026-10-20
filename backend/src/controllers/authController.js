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

/**
 * POST /api/v1/auth/forgot-password
 * Initiates a password reset request. Returns generic response to prevent account enumeration.
 */
async function forgotPassword(req, res, next) {
  try {
    const { email, username, identifier, captchaId, captchaAnswer } = req.body;
    const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    await authService.forgotPassword({
      email,
      username,
      identifier,
      captchaId,
      captchaAnswer,
      clientIp,
    });

    return sendSuccess(
      res,
      200,
      'If an account matching the provided identifier exists, a password reset link has been sent.',
      null
    );
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/reset-password
 * Completes a password reset using a valid, unexpired reset token.
 */
async function resetPassword(req, res, next) {
  try {
    const token = req.body.token || req.body.resetToken;
    const newPassword = req.body.newPassword || req.body.password;
    const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';

    await authService.resetPassword({
      token,
      newPassword,
      clientIp,
    });

    return sendSuccess(
      res,
      200,
      'Password has been reset successfully. Please log in with your new password.',
      null
    );
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/auth/dev-reset-token/:identifier
 * Development-only endpoint to retrieve the simulated reset token for testing.
 */
function getDevResetToken(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  const identifier = req.params.identifier;
  const token = authService.getDevResetToken(identifier);
  if (!token) {
    return sendSuccess(res, 200, 'No active reset token found.', null);
  }
  return sendSuccess(res, 200, 'Dev reset token retrieved.', {
    identifier,
    token,
    resetUrl: `http://localhost:3000/reset-password?token=${token}`,
  });
}

module.exports = {
  getCaptcha,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getDevResetToken,
};


