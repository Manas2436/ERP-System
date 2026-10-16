/**
 * backend/src/app.js
 *
 * Express application factory.
 *
 * This file configures the Express instance with all middleware and routes.
 * It does NOT start the HTTP server — that is done in server.js so that
 * the app instance can be imported by tests without binding to a port.
 *
 * Middleware order (matters):
 *  1. Helmet   — sets HTTP security headers early
 *  2. CORS     — must be before routes so preflight OPTIONS requests are handled
 *  3. JSON body parser — with size limit to mitigate payload attacks
 *  4. Routes
 *  5. 404 handler    — after all routes
 *  6. Error handler  — last (4-argument signature)
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./config/env');
const apiRouter = require('./routes/index');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// ── 1. Security headers (Helmet) ──────────────────────────────────────────────
app.use(helmet());

// ── 2. CORS ───────────────────────────────────────────────────────────────────
const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin header (e.g., curl, Postman, server-to-server).
    if (!origin) return callback(null, true);

    if (env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    logger.warn('CORS blocked request from disallowed origin', { origin });
    return callback(new Error(`CORS policy does not allow origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// ── 3. JSON body parser ───────────────────────────────────────────────────────
// Limit body size to 50 KB to mitigate large-payload DoS.
// Malformed JSON is caught by the centralized errorHandler (entity.parse.failed).
app.use(express.json({ limit: '50kb' }));

// ── 4. API Routes ─────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── 5. Unknown routes → 404 ───────────────────────────────────────────────────
app.use(notFound);

// ── 6. Centralized error handler (must be last) ───────────────────────────────
app.use(errorHandler);

module.exports = app;
