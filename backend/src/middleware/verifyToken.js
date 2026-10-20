/**
 * backend/src/middleware/verifyToken.js
 *
 * Bearer-token authentication middleware.
 *
 * Extracts and verifies the JWT from the Authorization header.
 * On success: attaches `req.user = { id, role }` and calls next().
 * On failure: returns a 401 JSON error — never reveals why verification failed
 *   beyond the category (missing / invalid / expired) so as not to aid attackers.
 *
 * Usage:
 *   const verifyToken = require('../middleware/verifyToken');
 *   router.get('/protected', verifyToken, controller.handler);
 *
 * req.user shape (after successful verification):
 *   { id: string, role: 'ADMIN' | 'FACULTY' | 'STUDENT' }
 */

'use strict';

const jwt                     = require('jsonwebtoken');
const { verifyAccessToken }   = require('../utils/jwt');
const { error: sendError }    = require('../utils/responseBuilder');
const logger                  = require('../utils/logger');

const ALLOWED_ROLES = new Set(['ADMIN', 'FACULTY', 'STUDENT']);

/**
 * Express middleware that enforces a valid Bearer JWT on each request.
 */
function verifyToken(req, res, next) {
  // 1. Extract the Authorization header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    return sendError(res, 401, 'Authorization header is missing.');
  }

  // 2. Validate the "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return sendError(res, 401, 'Authorization header must use Bearer scheme.');
  }

  const token = parts[1];
  if (!token) {
    return sendError(res, 401, 'Bearer token is empty.');
  }

  // 3. Verify the token
  try {
    const decoded = verifyAccessToken(token);

    // 4. Validate that the role claim is a known role (defense-in-depth)
    if (!ALLOWED_ROLES.has(decoded.role)) {
      logger.warn('Token contains unknown role', { role: decoded.role });
      return sendError(res, 401, 'Token contains an unrecognized role.');
    }

    // 5. Attach a safe user object — never forward the raw decoded token
    req.user = {
      id:   decoded.sub,   // sub is the user id as a string
      role: decoded.role,
    };

    return next();
  } catch (err) {
    // Distinguish error types for the client without leaking internals
    if (err instanceof jwt.TokenExpiredError) {
      return sendError(res, 401, 'Token has expired. Please log in again.');
    }
    // Covers JsonWebTokenError (bad signature, malformed, type mismatch, etc.)
    if (err instanceof jwt.JsonWebTokenError) {
      return sendError(res, 401, 'Invalid token.');
    }
    // Unexpected error — log and return 401 (not 500 — do not expose internals)
    logger.error('Unexpected error in verifyToken', { message: err.message });
    return sendError(res, 401, 'Token verification failed.');
  }
}

verifyToken.verifyToken = verifyToken;
verifyToken.ALLOWED_ROLES = ALLOWED_ROLES;

module.exports = verifyToken;
