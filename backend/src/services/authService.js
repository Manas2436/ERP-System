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
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { captchaService } = require('./captchaService');
const emailService = require('./emailService');
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

    // 2. Fetch user via stored procedure sp_get_user_by_username (or email lookup)
    let user = null;
    try {
      const [results] = await db.query('CALL sp_get_user_by_username(?)', [trimmedUsername]);
      if (results && results[0] && results[0].length > 0) {
        user = results[0][0];
      } else {
        const [emailRows] = await db.query(
          'SELECT `id`, `username`, `email`, `password_hash`, `role`, `is_active`, `failed_login_attempts`, `locked_until`, `last_login_at`, `created_at`, `updated_at` FROM `users` WHERE `email` = ? LIMIT 1',
          [trimmedUsername]
        );
        if (emailRows && emailRows.length > 0) {
          user = emailRows[0];
        }
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

  /**
   * Initiates the forgot-password flow.
   *
   * Security guarantees:
   *  - Generic response: returns the exact same envelope whether the user exists or not,
   *    and whether active or deactivated, preventing account enumeration.
   *  - Cryptographically secure 256-bit token generation (crypto.randomBytes(32)).
   *  - Stored strictly as SHA-256 hash in database; raw token is never persisted in MySQL.
   *  - Expiry timestamp configured via PASSWORD_RESET_TOKEN_EXPIRY_MINUTES (default 15m).
   *  - Timing attack defense: runs dummy cryptographic hashing when account does not exist.
   *  - No sensitive logging: tokens, passwords, and sensitive account details are never logged.
   *  - Zero exposure in production: raw tokens are never returned in HTTP responses.
   *  - Dev testing mechanism: in test/development environment, allows test assertions via
   *    internal getDevResetToken(). In production, this returns null.
   *
   * @param {object} params
   * @param {string} [params.email]
   * @param {string} [params.username]
   * @param {string} [params.identifier]
   * @param {string} [params.captchaId]
   * @param {string} [params.captchaAnswer]
   * @param {string} [params.clientIp]
   * @returns {Promise<object>} Generic status indicator
   */
  async forgotPassword({ email, username, identifier, captchaId, captchaAnswer, clientIp }) {
    // 1. If CAPTCHA challenge is provided, verify and consume it
    if (captchaId) {
      const captchaResult = captchaService.verifyChallenge(captchaId, captchaAnswer);
      if (!captchaResult.valid) {
        const err = new Error(captchaResult.reason || 'Invalid CAPTCHA.');
        err.statusCode = 400;
        throw err;
      }
    }

    const rawIdentifier = email || username || identifier;
    const trimmed = String(rawIdentifier).trim();

    // 2. Look up user by email OR username using parameterized SQL
    let user = null;
    try {
      const [rows] = await db.query(
        `SELECT \`id\`, \`username\`, \`email\`, \`is_active\`
         FROM \`users\`
         WHERE \`email\` = ? OR \`username\` = ?
         LIMIT 1`,
        [trimmed, trimmed]
      );
      if (rows && rows.length > 0) {
        user = rows[0];
      }
    } catch (dbErr) {
      logger.error('Database error during password reset lookup', { message: dbErr.message });
      const err = new Error('Database error processing password reset request.');
      err.statusCode = 500;
      throw err;
    }

    // 3. Timing attack defense for non-existent user
    if (!user) {
      const dummyRaw = crypto.randomBytes(32).toString('hex');
      crypto.createHash('sha256').update(dummyRaw).digest('hex');
      logger.warn('Password reset requested for non-existent account identifier', { ip: clientIp });
      return { sent: true };
    }

    // 4. If account is deactivated, do not generate token; return same generic response
    if (user.is_active !== 1) {
      logger.warn('Password reset requested for deactivated account', {
        userId: user.id,
        ip: clientIp,
      });
      return { sent: true };
    }

    // 5. Generate cryptographically secure random token (256 bits of entropy)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiryMinutes = env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // 6. Store ONLY the SHA-256 hash and expiration timestamp in MySQL
    try {
      await db.query(
        `UPDATE \`users\`
         SET \`password_reset_token_hash\` = ?,
             \`password_reset_expires_at\` = ?
         WHERE \`id\` = ?`,
        [tokenHash, expiresAt, user.id]
      );
    } catch (updateErr) {
      logger.error('Failed to store password reset token hash', { message: updateErr.message });
      const err = new Error('Database error storing password reset token.');
      err.statusCode = 500;
      throw err;
    }

    // 7. Dispatch real password reset email via configured SMTP (Gmail)
    try {
      await emailService.sendPasswordResetEmail({
        to: user.email,
        username: user.username,
        resetToken: rawToken,
      });
    } catch (mailErr) {
      logger.error('Failed to dispatch password reset email', { message: mailErr.message });
    }

    // 8. Development testing hook: store token in-memory ONLY when NODE_ENV !== 'production'
    if (process.env.NODE_ENV !== 'production') {
      devResetTokens.set(user.email.toLowerCase(), rawToken);
      devResetTokens.set(user.username.toLowerCase(), rawToken);
    }

    logger.info('Password reset token generated, stored and dispatched', {
      userId: user.id,
      email: user.email,
      ip: clientIp,
    });

    return { sent: true };
  }

  /**
   * Completes a password reset.
   *
   * Security guarantees:
   *  - Single-use guarantee: atomically verifies token hash, verifies expiry,
   *    updates password, and sets password_reset_token_hash = NULL in a single transaction.
   *  - Concurrency protection: SELECT ... FOR UPDATE serializes concurrent reset attempts;
   *    only exactly one request can succeed.
   *  - Session revocation: revokes ALL existing refresh tokens in refresh_tokens table.
   *  - Access tokens: documented note that stateless JWT access tokens remain valid until natural expiry.
   *  - Password policy: hashes new password using bcryptjs utility.
   *  - Lockout reset: clears failed_login_attempts and locked_until, allowing immediate login.
   *
   * @param {object} params
   * @param {string} params.token
   * @param {string} params.newPassword
   * @param {string} [params.clientIp]
   * @returns {Promise<object>} Reset status
   */
  async resetPassword({ token, newPassword, clientIp }) {
    if (!token || typeof token !== 'string') {
      const err = new Error('Reset token is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      const err = new Error('New password must be at least 8 characters.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    // Perform atomic verification, password update, and token consumption inside transaction
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Retrieve user with row lock matching token hash
      const [userRows] = await conn.query(
        `SELECT \`id\`, \`username\`, \`email\`, \`is_active\`, \`password_reset_expires_at\`
         FROM \`users\`
         WHERE \`password_reset_token_hash\` = ?
         FOR UPDATE`,
        [tokenHash]
      );

      if (!userRows || userRows.length === 0) {
        const err = new Error('Invalid or expired password reset token.');
        err.statusCode = 400;
        throw err;
      }

      const user = userRows[0];

      // Check database expiration
      if (new Date(user.password_reset_expires_at) <= new Date()) {
        const err = new Error('Password reset token has expired.');
        err.statusCode = 400;
        throw err;
      }

      // Check active account status
      if (user.is_active !== 1) {
        const err = new Error('Account is deactivated. Please contact an administrator.');
        err.statusCode = 403;
        throw err;
      }

      // Hash the new password using existing password utility
      const newPasswordHash = await hashPassword(newPassword);

      // Atomically update password, consume reset token, and clear any existing login lockouts
      await conn.query(
        `UPDATE \`users\`
         SET \`password_hash\` = ?,
             \`password_reset_token_hash\` = NULL,
             \`password_reset_expires_at\` = NULL,
             \`failed_login_attempts\` = 0,
             \`locked_until\` = NULL
         WHERE \`id\` = ?`,
        [newPasswordHash, user.id]
      );

      // Revoke all active refresh-token sessions for this user
      await conn.query(
        `UPDATE \`refresh_tokens\`
         SET \`is_revoked\` = 1,
             \`revoked_at\` = NOW()
         WHERE \`user_id\` = ? AND \`is_revoked\` = 0`,
        [user.id]
      );

      await conn.commit();

      // Clean up dev testing store entry
      if (process.env.NODE_ENV !== 'production') {
        devResetTokens.delete(user.email.toLowerCase());
        devResetTokens.delete(user.username.toLowerCase());
      }

      logger.info('Password reset completed successfully', {
        userId: user.id,
        ip: clientIp,
      });

      return { reset: true };
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  }

  /**
   * Development-only helper: retrieve latest generated reset token.
   * Strictly returns null in production.
   *
   * @param {string} identifier - Email or username
   * @returns {string|null}
   */
  getDevResetToken(identifier) {
    if (process.env.NODE_ENV === 'production' || !identifier) {
      return null;
    }
    return devResetTokens.get(String(identifier).trim().toLowerCase()) || null;
  }

  /**
   * Development-only helper: clear all cached reset tokens.
   */
  clearDevResetTokens() {
    devResetTokens.clear();
  }
}

// In-memory token store used exclusively for development and automated test assertions.
// Never active or populated in production environments.
const devResetTokens = new Map();

const authService = new AuthService();

module.exports = {
  authService,
  AuthService,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
};
