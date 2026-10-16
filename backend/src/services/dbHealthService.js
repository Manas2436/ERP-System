/**
 * backend/src/services/dbHealthService.js
 *
 * Performs a non-destructive database connectivity check.
 *
 * Used by GET /api/health to report an accurate, live database status
 * without exposing SQL error details or credentials to the HTTP client.
 *
 * Returns one of three status objects:
 *
 *   { status: 'connected',    latency_ms: <number> }
 *   { status: 'disconnected', reason: 'configuration_missing' }
 *   { status: 'unavailable',  reason: 'connection_failed' }
 *
 * The 'reason' field uses a short machine-readable code — never raw SQL
 * error messages — so clients get safe feedback without internal details.
 */

'use strict';

const env    = require('../config/env');
const logger = require('../utils/logger');

/**
 * Lazily require the pool so that if DB credentials are missing the
 * entire module doesn't crash on load — we just return 'disconnected'.
 */
function getPool() {
  // Only attempt to load the pool if the minimum required config is present.
  if (!env.DB_USER || !env.DB_PASSWORD || !env.DB_NAME) {
    return null;
  }
  // Pool module is a singleton — requiring it again returns the cached instance.
  return require('../config/db');
}

/**
 * Check DB connectivity with a lightweight SELECT 1 query.
 *
 * @returns {Promise<{status: string, latency_ms?: number, reason?: string}>}
 */
async function checkDbHealth() {
  // Guard: credentials not configured yet.
  if (!env.DB_USER || env.DB_USER === 'your_mysql_user' ||
      !env.DB_PASSWORD || env.DB_PASSWORD === 'your_mysql_password' ||
      !env.DB_NAME) {
    return { status: 'disconnected', reason: 'configuration_missing' };
  }

  const pool = getPool();
  if (!pool) {
    return { status: 'disconnected', reason: 'configuration_missing' };
  }

  const start = Date.now();
  let connection;

  try {
    // Borrow one connection from the pool for the ping query.
    connection = await pool.getConnection();
    await connection.query('SELECT 1');
    const latency = Date.now() - start;
    return { status: 'connected', latency_ms: latency };
  } catch (err) {
    // Log full error server-side for diagnostics; return only a safe code.
    logger.error('Database health check failed', {
      code   : err.code,
      errno  : err.errno,
      // err.message is logged server-side only — not sent to client
      message: err.message,
    });
    return { status: 'unavailable', reason: 'connection_failed' };
  } finally {
    // Always release the connection back to the pool.
    if (connection) connection.release();
  }
}

module.exports = { checkDbHealth };
