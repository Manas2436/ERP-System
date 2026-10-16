/**
 * backend/src/config/db.js
 *
 * MySQL connection pool using mysql2/promise.
 *
 * Design decisions:
 *  - Uses a pool (not a single connection) so that multiple concurrent
 *    requests each get a connection without blocking each other.
 *  - Pool is created once at module load time and reused across all requests.
 *  - The pool is exported so it can be imported directly by services,
 *    or wrapped by a testable db helper.
 *  - Connection errors are surfaced to the caller — never swallowed silently.
 *  - Credentials come exclusively from env.js (which reads .env).
 *    No credential is hardcoded or logged here.
 *
 * Usage:
 *   const pool = require('./db');
 *   const [rows] = await pool.query('SELECT 1');
 *
 * Graceful shutdown:
 *   await pool.end();   // called from server.js on SIGTERM/SIGINT
 */

'use strict';

const mysql = require('mysql2/promise');
const env   = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host              : env.DB_HOST,
  port              : env.DB_PORT,
  database          : env.DB_NAME,
  user              : env.DB_USER,
  password          : env.DB_PASSWORD,
  connectionLimit   : env.DB_CONNECTION_LIMIT,
  waitForConnections: true,       // queue requests when pool is full
  queueLimit        : 0,          // 0 = unlimited queue
  enableKeepAlive   : true,       // prevent idle connection drops
  keepAliveInitialDelay: 10000,   // ms before first keep-alive probe
  // Timezone: store and retrieve dates in UTC
  timezone          : '+00:00',
  // Strict mode — raise errors for invalid data rather than silently truncating
  multipleStatements: false,      // mitigate multi-statement injection
  // Named placeholders are not used here; positional ? is standard
  namedPlaceholders : false,
});

logger.info('MySQL connection pool created', {
  host    : env.DB_HOST,
  port    : env.DB_PORT,
  database: env.DB_NAME,
  user    : env.DB_USER,
  // password is intentionally NOT logged
});

module.exports = pool;
