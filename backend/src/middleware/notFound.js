/**
 * backend/src/middleware/notFound.js
 *
 * Catch-all handler for any route that does not match a registered path.
 * Registered AFTER all routes, BEFORE the errorHandler.
 *
 * Returns a 404 response in the standard JSON envelope rather than
 * Express's default HTML "Cannot GET /..." page.
 */

'use strict';

const { error: sendError } = require('../utils/responseBuilder');

function notFound(req, res) {
  return sendError(
    res,
    404,
    `Route not found: ${req.method} ${req.originalUrl}`
  );
}

module.exports = notFound;
