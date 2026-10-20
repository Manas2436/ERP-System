/**
 * backend/src/middleware/errorHandler.js
 *
 * Centralized Express error-handling middleware (4-argument signature).
 * Must be registered LAST in the Express middleware chain (after all routes).
 *
 * Behaviour:
 *  - Logs the full error internally (including stack in development).
 *  - Returns a sanitized JSON response:
 *      → development: includes error message (aids debugging)
 *      → production:  hides internals, shows only "Internal server error"
 *  - Never leaks stack traces, file paths, or implementation details
 *    to the API consumer in production.
 */

'use strict';

const { error: sendError } = require('../utils/responseBuilder');
const logger = require('../utils/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Log full details server-side for diagnostics.
  logger.error('Unhandled error', {
    message: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
    method: req.method,
    url: req.originalUrl,
    status: err.status || err.statusCode,
  });

  // Handle malformed JSON body (thrown by express.json() parser).
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'Malformed JSON in request body.');
  }

  // Use an explicit HTTP status attached to the error, if present.
  const statusCode =
    (Number.isInteger(err.status) && err.status >= 400 && err.status < 600)
      ? err.status
      : (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600)
        ? err.statusCode
        : 500;

  // In production, hide internal error messages and raw database details.
  const isProd = process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production';
  let message =
    isProd && statusCode === 500
      ? 'Internal server error.'
      : err.message || 'Internal server error.';

  if (isProd && /ER_[A-Z_]+|SQLSTATE|syntax to use near|Unknown column/i.test(message)) {
    message = 'Internal server error.';
  }

  return sendError(res, statusCode, message);
}

module.exports = errorHandler;
