/**
 * backend/src/utils/jwt.js
 *
 * JWT creation and verification utilities.
 *
 * Design decisions:
 *  - Signing secret comes exclusively from env.JWT_SECRET.
 *    Startup fails early in production if the secret is absent or too short.
 *  - Algorithm: HS256 — symmetric, widely supported, fast, and appropriate
 *    for a single-service deployment. Upgrade to RS256 when multi-service
 *    token verification is needed (see ARCHITECTURE_NOTE.md Pattern B).
 *  - Claims included: sub (user id), role, iat, exp.
 *    Never includes password, hash, reset token, or unnecessary PII.
 *  - Access tokens and refresh tokens are distinct: the 'type' custom claim
 *    is set to 'access' or 'refresh' so each can only be used for its purpose.
 *  - Errors are typed into two categories:
 *      TokenExpiredError  → 401, "Token has expired."
 *      JsonWebTokenError  → 401, "Invalid token."
 *    Stack traces are never sent to the client.
 *
 * Usage:
 *   const { signAccessToken, signRefreshToken, verifyAccessToken } = require('./jwt');
 *   const token   = signAccessToken({ id: 1, role: 'ADMIN' });
 *   const payload = verifyAccessToken(token);  // throws on invalid/expired
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// ── Security constants ─────────────────────────────────────────────────────────
const ALGORITHM    = 'HS256';
const MIN_SECRET_LENGTH = 32; // 32 characters = 256 bits minimum

/**
 * Retrieve the signing secret, enforcing minimum length in production.
 * Called lazily so tests can override process.env before requiring this module.
 */
function getSecret() {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }
  if (env.NODE_ENV === 'production' && secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is too short (${secret.length} chars). ` +
      `Production requires at least ${MIN_SECRET_LENGTH} characters.`
    );
  }
  return secret;
}

/**
 * Sign a JWT access token.
 *
 * @param {{ id: number|string, role: string }} payload
 * @returns {string} Signed JWT string.
 */
function signAccessToken(payload) {
  if (!payload || !payload.id || !payload.role) {
    throw new Error('signAccessToken: payload must contain id and role.');
  }
  return jwt.sign(
    {
      sub:  String(payload.id),
      role: payload.role,
      type: 'access',
    },
    getSecret(),
    {
      algorithm : ALGORITHM,
      expiresIn : env.JWT_EXPIRES_IN || '8h',
    }
  );
}

/**
 * Sign a JWT refresh token.
 * Refresh tokens contain minimal claims to limit blast radius if leaked.
 *
 * @param {{ id: number|string }} payload
 * @returns {string} Signed JWT string.
 */
function signRefreshToken(payload) {
  if (!payload || !payload.id) {
    throw new Error('signRefreshToken: payload must contain id.');
  }
  return jwt.sign(
    {
      sub:  String(payload.id),
      type: 'refresh',
      jti:  crypto.randomBytes(16).toString('hex'),
    },
    getSecret(),
    {
      algorithm : ALGORITHM,
      expiresIn : env.JWT_REFRESH_EXPIRES_IN || '7d',
    }
  );
}

/**
 * Verify and decode an access token.
 *
 * @param {string} token  The raw JWT string (without 'Bearer ' prefix).
 * @returns {{ sub: string, role: string, type: string, iat: number, exp: number }}
 * @throws  {jwt.TokenExpiredError}  If the token has expired.
 * @throws  {jwt.JsonWebTokenError}  If the token is malformed or has an invalid signature.
 * @throws  {Error}                  If the token type claim is not 'access'.
 */
function verifyAccessToken(token) {
  const decoded = jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
  if (decoded.type !== 'access') {
    // Prevent refresh tokens from being accepted on access-token endpoints.
    const err = new jwt.JsonWebTokenError('Token type mismatch.');
    throw err;
  }
  return decoded;
}

/**
 * Verify and decode a refresh token.
 *
 * @param {string} token
 * @returns {{ sub: string, type: string, iat: number, exp: number }}
 * @throws  {jwt.TokenExpiredError | jwt.JsonWebTokenError}
 */
function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
  if (decoded.type !== 'refresh') {
    const err = new jwt.JsonWebTokenError('Token type mismatch.');
    throw err;
  }
  return decoded;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  // Export for use in tests only — do not use in application code
  _getSecret: getSecret,
};
