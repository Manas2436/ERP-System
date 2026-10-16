/**
 * backend/src/services/authService.js
 *
 * Core authentication service handling credential validation, CAPTCHA verification,
 * account lockout policy enforcement, and JWT issuance.
 *
 * Security guarantees:
 *  - CAPTCHA is verified and consumed BEFORE database credential checks.
 *  - Generic authentication errors: Non-existent usernames and wrong passwords
 *    produce the identical error message ("Invalid username or password.").
 *  - Timing attack defense: Dummy password comparison runs when username is not found.
 *  - Account lockout: 5 consecutive failed attempts trigger a 15-minute lockout.
 *  - Atomic counter updates: Failed/successful logins update users table safely.
 *  - Zero sensitive leakage: Password hashes, reset tokens, and attempt counts
 *    are never returned to the caller or logged.
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const { comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { captchaService } = require('./captchaService');
const logger = require('../utils/logger');

// Security policy constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Precomputed bcrypt hash used for timing mitigation when user does not exist.
// Cost factor 12, valid bcrypt format.
const DUMMY_HASH = '$2a$12$e8rXp90L4gqAOBs95k2R.uN.i6b0w1O99Qn3G37tYV3Yj7E2L6nWa';

class AuthService {
  /**
   * Authenticates user credentials after validating CAPTCHA.
   *
   * @param {object} params
   * @param {string} params.username
   * @param {string} params.password
   * @param {string} params.captchaId
   * @param {string} params.captchaAnswer
   * @param {string} [params.clientIp]
   * @returns {Promise<object>} Auth tokens and safe user summary
   */
  async login({ username, password, captchaId, captchaAnswer, clientIp }) {
    // 1. Verify CAPTCHA challenge first (before any database or crypto operation)
    const captchaResult = captchaService.verifyChallenge(captchaId, captchaAnswer);
    if (!captchaResult.valid) {
      const err = new Error(captchaResult.reason || 'Invalid CAPTCHA.');
      err.statusCode = 400;
      throw err;
    }

    const trimmedUsername = String(username).trim();

    // 2. Fetch user via stored procedure sp_get_user_by_username
    let user = null;
    try {
      const [results] = await db.query('CALL sp_get_user_by_username(?)', [trimmedUsername]);
      if (results && results[0] && results[0].length > 0) {
        user = results[0][0];
      }
    } catch (dbErr) {
      logger.error('Database error during user credential lookup', {
        message: dbErr.message,
      });
      const err = new Error('Database error during authentication.');
      err.statusCode = 500;
      throw err;
    }

    // 3. User existence check with timing mitigation
    if (!user) {
      // Execute dummy compare to prevent timing-based user enumeration
      await comparePassword(password, DUMMY_HASH);
      logger.warn('Login failed: user not found', {
        username: trimmedUsername,
        ip: clientIp,
      });
      const err = new Error('Invalid username or password.');
      err.statusCode = 401;
      throw err;
    }

    // 4. Check if account is active
    if (user.is_active !== 1) {
      logger.warn('Login rejected: account deactivated', {
        userId: user.id,
        username: user.username,
        ip: clientIp,
      });
      const err = new Error('Account is deactivated. Please contact an administrator.');
      err.statusCode = 403;
      throw err;
    }

    // 5. Check if account is currently locked
    const now = new Date();
    if (user.locked_until && new Date(user.locked_until) > now) {
      logger.warn('Login rejected: account temporarily locked', {
        userId: user.id,
        username: user.username,
        lockedUntil: user.locked_until,
        ip: clientIp,
      });
      const err = new Error('Account is temporarily locked due to multiple failed login attempts. Please try again later.');
      err.statusCode = 423; // 423 Locked
      throw err;
    }

    // 6. Compare password against stored bcrypt hash
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      // Atomically increment failed_login_attempts and conditionally lock
      try {
        await db.query(
          `UPDATE \`users\`
           SET
             \`failed_login_attempts\` = CASE
               WHEN \`locked_until\` IS NOT NULL AND \`locked_until\` <= NOW() THEN 1
               ELSE \`failed_login_attempts\` + 1
             END,
             \`locked_until\` = CASE
               WHEN \`locked_until\` IS NOT NULL AND \`locked_until\` <= NOW() THEN NULL
               WHEN (\`failed_login_attempts\` + 1) >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
               ELSE \`locked_until\`
             END
           WHERE \`id\` = ?`,
          [MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES, user.id]
        );
      } catch (updateErr) {
        logger.error('Failed to update login attempt counter', { message: updateErr.message });
      }

      logger.warn('Login failed: invalid password', {
        userId: user.id,
        username: user.username,
        ip: clientIp,
      });

      const err = new Error('Invalid username or password.');
      err.statusCode = 401;
      throw err;
    }

    // 7. Successful login: Reset counter and update last_login_at
    try {
      await db.query(
        `UPDATE \`users\`
         SET
           \`failed_login_attempts\` = 0,
           \`locked_until\` = NULL,
           \`last_login_at\` = NOW()
         WHERE \`id\` = ?`,
        [user.id]
      );
    } catch (resetErr) {
      logger.error('Failed to reset login counter on success', { message: resetErr.message });
    }

    // 8. Generate JWT tokens
    const accessToken = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id });

    // Persist refresh token hash in database for rotation and revocation tracking
    try {
      const decodedRefresh = jwt.decode(refreshToken);
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(decodedRefresh.exp * 1000);

      await db.query(
        `INSERT INTO \`refresh_tokens\` (\`user_id\`, \`token_hash\`, \`expires_at\`)
         VALUES (?, ?, ?)`,
        [user.id, tokenHash, expiresAt]
      );
    } catch (tokenErr) {
      logger.error('Failed to persist refresh token hash', { message: tokenErr.message });
      const err = new Error('Authentication failed due to token storage error.');
      err.statusCode = 500;
      throw err;
    }

    logger.info('User successfully authenticated', {
      userId: user.id,
      role: user.role,
      ip: clientIp,
    });

    // 9. Return safe response structure conforming to API contract
    return {
      token: accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: env.JWT_EXPIRES_IN || '8h',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Rotates a refresh token and issues a replacement access token and refresh token.
   *
   * Enforces:
   *  - JWT signature and expiry check.
   *  - Token type check ('refresh' only; rejects 'access' tokens).
   *  - Row-locked atomic transaction to prevent race conditions & token reuse.
   *  - Persisted revocation state check (replay attack detection).
   *  - Current user existence and active account status check.
   *  - Atomic revocation of the old token and issuance of replacement.
   *
   * @param {object} params
   * @param {string} params.refreshToken
   * @param {string} [params.clientIp]
   * @returns {Promise<object>} New tokens and user metadata
   */
  async refresh({ refreshToken, clientIp }) {
    // 1. Verify token signature, expiry, and token type
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (jwtErr) {
      if (jwtErr instanceof jwt.TokenExpiredError) {
        const err = new Error('Refresh token has expired.');
        err.statusCode = 401;
        throw err;
      }
      const err = new Error('Invalid refresh token.');
      err.statusCode = 401;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // 2. Perform atomic rotation inside a transaction with row-level locking
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Retrieve persisted refresh token with row-level lock (FOR UPDATE)
      const [tokenRows] = await conn.query(
        `SELECT \`id\`, \`user_id\`, \`token_hash\`, \`expires_at\`, \`is_revoked\`
         FROM \`refresh_tokens\`
         WHERE \`token_hash\` = ?
         FOR UPDATE`,
        [tokenHash]
      );

      if (!tokenRows || tokenRows.length === 0) {
        const err = new Error('Invalid or unrecognized refresh token.');
        err.statusCode = 401;
        throw err;
      }

      const storedToken = tokenRows[0];

      // Replay detection: If token was already revoked, reject immediately
      if (storedToken.is_revoked === 1) {
        logger.warn('Replay attack detected: revoked refresh token used', {
          tokenId: storedToken.id,
          userId: storedToken.user_id,
          ip: clientIp,
        });
        const err = new Error('Refresh token has been revoked.');
        err.statusCode = 401;
        throw err;
      }

      // Check database expiration
      if (new Date(storedToken.expires_at) <= new Date()) {
        const err = new Error('Refresh token has expired.');
        err.statusCode = 401;
        throw err;
      }

      // 3. Verify user existence and active status
      const [userRows] = await conn.query(
        `SELECT \`id\`, \`username\`, \`email\`, \`role\`, \`is_active\`, \`locked_until\`
         FROM \`users\`
         WHERE \`id\` = ?
         FOR UPDATE`,
        [storedToken.user_id]
      );

      if (!userRows || userRows.length === 0) {
        const err = new Error('User account no longer exists.');
        err.statusCode = 401;
        throw err;
      }

      const user = userRows[0];

      if (user.is_active !== 1) {
        const err = new Error('Account is deactivated. Please contact an administrator.');
        err.statusCode = 403;
        throw err;
      }

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const err = new Error('Account is temporarily locked due to multiple failed login attempts. Please try again later.');
        err.statusCode = 423;
        throw err;
      }

      // 4. Generate replacement access and refresh tokens
      const newAccessToken = signAccessToken({ id: user.id, role: user.role });
      const newRefreshToken = signRefreshToken({ id: user.id });
      const decodedNew = jwt.decode(newRefreshToken);
      const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const newExpiresAt = new Date(decodedNew.exp * 1000);

      // 5. Atomically revoke the old refresh token and link replacement
      await conn.query(
        `UPDATE \`refresh_tokens\`
         SET \`is_revoked\` = 1, \`revoked_at\` = NOW(), \`replaced_by_token_hash\` = ?
         WHERE \`id\` = ?`,
        [newTokenHash, storedToken.id]
      );

      // 6. Persist replacement refresh token
      await conn.query(
        `INSERT INTO \`refresh_tokens\` (\`user_id\`, \`token_hash\`, \`expires_at\`)
         VALUES (?, ?, ?)`,
        [user.id, newTokenHash, newExpiresAt]
      );

      await conn.commit();

      logger.info('Refresh token rotated successfully', {
        userId: user.id,
        role: user.role,
        ip: clientIp,
      });

      return {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: env.JWT_EXPIRES_IN || '8h',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      };
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  }

  /**
   * Revokes the supplied refresh token upon logout.
   *
   * Idempotent: repeated logout calls with an already-revoked or expired
   * token succeed safely without leaking state or causing errors.
   *
   * Note on Access Tokens: Stateless JWT access tokens remain valid until their
   * naturally configured expiry (e.g. 8h). Logout revokes the session's
   * refresh capability so that no further access tokens can be obtained.
   *
   * @param {object} params
   * @param {string} params.refreshToken
   * @param {string} [params.clientIp]
   * @returns {Promise<object>} Revocation status
   */
  async logout({ refreshToken, clientIp }) {
    // 1. Verify token signature and type (reject access tokens presented as refresh tokens)
    try {
      verifyRefreshToken(refreshToken);
    } catch (jwtErr) {
      if (jwtErr instanceof jwt.TokenExpiredError) {
        // Expired token can still be revoked if present in DB
      } else {
        const err = new Error('Invalid refresh token.');
        err.statusCode = 401;
        throw err;
      }
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // 2. Mark token as revoked in the database (idempotent update)
    try {
      await db.query(
        `UPDATE \`refresh_tokens\`
         SET \`is_revoked\` = 1, \`revoked_at\` = NOW()
         WHERE \`token_hash\` = ? AND \`is_revoked\` = 0`,
        [tokenHash]
      );
    } catch (dbErr) {
      logger.error('Error revoking refresh token on logout', { message: dbErr.message });
      const err = new Error('Database error during logout.');
      err.statusCode = 500;
      throw err;
    }

    logger.info('Refresh token revoked upon logout', { ip: clientIp });

    return { revoked: true };
  }
}

const authService = new AuthService();

module.exports = {
  authService,
  AuthService,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
};
