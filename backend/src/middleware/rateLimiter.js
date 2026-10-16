/**
 * backend/src/middleware/rateLimiter.js
 *
 * Lightweight, in-memory rate limiting middleware with sliding window / bucket expiry,
 * standard RateLimit HTTP headers, and standard error envelope responses.
 *
 * Design decisions:
 *  - Configurable window size (windowMs) and max requests per window.
 *  - Keyed by client IP (default) or custom key generator.
 *  - Automatically purges expired tracking windows to prevent memory leaks.
 *  - In test environment (NODE_ENV === 'test'), rate limits can be relaxed or
 *    configured separately so test suites with rapid assertions do not get throttled,
 *    while dedicated rate-limiter unit tests can test exact threshold behavior.
 */

'use strict';

const { error: sendError } = require('../utils/responseBuilder');

/**
 * Creates an Express rate-limiting middleware instance.
 *
 * @param {object} options
 * @param {number} [options.windowMs=900000] - Window duration in milliseconds (default: 15 min)
 * @param {number} [options.max=100]        - Max requests allowed per window
 * @param {string} [options.message]        - Error message on 429 response
 * @param {Function} [options.keyGenerator] - Function(req) -> string (default: client IP)
 * @param {boolean} [options.skipInTest=false] - Whether to bypass in NODE_ENV === 'test'
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;
  const message = options.message || 'Too many requests, please try again later.';
  const keyGenerator = options.keyGenerator || ((req) => {
    return req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
  });
  const skipInTest = options.skipInTest !== undefined ? options.skipInTest : false;

  const hits = new Map();

  // Periodic cleanup of expired rate limit entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  const middleware = function rateLimit(req, res, next) {
    if (skipInTest && process.env.NODE_ENV === 'test') {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    let record = hits.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil(record.resetTime / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return sendError(res, 429, message);
    }

    return next();
  };

  // Expose reset method for testing
  middleware.reset = () => hits.clear();

  return middleware;
}

module.exports = { createRateLimiter };
