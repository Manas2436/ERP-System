/**
 * backend/src/routes/healthRoutes.js
 *
 * GET /api/health — infrastructure health check endpoint.
 *
 * Reports two independent status items:
 *  • api      — always "ok" if this response is received (process is running)
 *  • database — result of a real SELECT 1 ping against the MySQL pool
 *
 * Response shape (HTTP 200 in all cases — health endpoints should always
 * respond so that monitors can read the body even when DB is down):
 * {
 *   "success": true,
 *   "message": "API is running",
 *   "data": {
 *     "api": {
 *       "status":      "ok",
 *       "environment": "development",
 *       "uptime_s":    49.21,
 *       "timestamp":   "2026-10-14T09:00:00.000Z"
 *     },
 *     "database": {
 *       "status":     "connected",   // "connected" | "disconnected" | "unavailable"
 *       "latency_ms": 3              // only present when connected
 *       // "reason": "..."           // only present when not connected
 *     }
 *   },
 *   "errors": null
 * }
 *
 * Security:
 *  - No SQL errors, credentials, or internal stack traces are returned.
 *  - Does not require authentication (it's a public infrastructure route).
 */

'use strict';

const { Router } = require('express');
const { success }       = require('../utils/responseBuilder');
const { checkDbHealth } = require('../services/dbHealthService');
const env               = require('../config/env');

const router = Router();

/**
 * GET /api/health
 */
router.get('/', async (req, res, next) => {
  try {
    const dbStatus = await checkDbHealth();

    return success(res, 200, 'API is running', {
      api: {
        status     : 'ok',
        environment: env.NODE_ENV,
        uptime_s   : parseFloat(process.uptime().toFixed(2)),
        timestamp  : new Date().toISOString(),
      },
      database: dbStatus,
    });
  } catch (err) {
    // Unexpected error in the health check itself — pass to error handler.
    next(err);
  }
});

module.exports = router;
