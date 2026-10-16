/**
 * backend/src/utils/responseBuilder.js
 *
 * Builds the standard JSON response envelope used by every API route.
 *
 * Success shape:
 *   { success: true,  message: string, data: object|null, errors: null }
 *
 * Error shape:
 *   { success: false, message: string, data: null, errors: array|null }
 *
 * All route handlers and error middleware call these helpers so that the
 * response structure is consistent across the entire API — and across any
 * future ERP modules that import this utility.
 */

'use strict';

/**
 * Send a successful response.
 *
 * @param {import('express').Response} res
 * @param {number}  statusCode  HTTP status (default 200)
 * @param {string}  message     Human-readable description
 * @param {*}       data        Payload to include (null if none)
 */
function success(res, statusCode = 200, message = 'OK', data = null) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    errors: null,
  });
}

/**
 * Send an error response.
 *
 * @param {import('express').Response} res
 * @param {number}        statusCode   HTTP status
 * @param {string}        message      Human-readable description
 * @param {Array|null}    errors       Validation errors or additional context
 */
function error(res, statusCode = 500, message = 'An error occurred', errors = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errors,
  });
}

module.exports = { success, error };
