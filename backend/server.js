/**
 * backend/server.js
 *
 * HTTP server entry point.
 *
 * Responsibilities:
 *  - Load the configured Express app.
 *  - Bind to the configured PORT.
 *  - Handle graceful shutdown on SIGTERM / SIGINT (Ctrl+C).
 *    On shutdown: close HTTP server first, then release the DB pool.
 *
 * Run with:
 *   npm start        — production (node server.js)
 *   npm run dev      — development with auto-reload (nodemon server.js)
 */

'use strict';

const app    = require('./src/app');
const env    = require('./src/config/env');
const logger = require('./src/utils/logger');

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info('Server started', {
    env   : env.NODE_ENV,
    port  : PORT,
    health: `http://localhost:${PORT}/api/health`,
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);

  // 1. Stop accepting new HTTP connections.
  server.close(async () => {
    logger.info('HTTP server closed');

    // 2. Release the MySQL connection pool (if it was initialised).
    try {
      const env = require('./src/config/env');
      if (env.DB_USER && env.DB_USER !== 'your_mysql_user' && env.DB_PASSWORD) {
        const pool = require('./src/config/db');
        await pool.end();
        logger.info('MySQL connection pool closed');
      }
    } catch (err) {
      logger.warn('Could not close DB pool cleanly', { message: err.message });
    }

    process.exit(0);
  });

  // Force-exit if graceful shutdown hangs beyond 10 seconds.
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections so they don't silently fail.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

