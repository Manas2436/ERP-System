/**
 * backend/src/utils/logger.js
 *
 * Minimal structured logger.
 * - In development: coloured console output with timestamps.
 * - In production: plain JSON-style lines (easy to pipe to log aggregators).
 *
 * Replace with a full logging library (e.g., winston, pino) in later stages
 * without changing call-sites, because all code imports this module.
 */

'use strict';

const env = require('../config/env');

const isDev = env.NODE_ENV !== 'production';

function timestamp() {
  return new Date().toISOString();
}

function format(level, message, meta) {
  if (isDev) {
    const colours = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m' };
    const reset = '\x1b[0m';
    const colour = colours[level] || '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${colour}[${timestamp()}] ${level}${reset} ${message}${metaStr}`;
  }
  return JSON.stringify({ ts: timestamp(), level, message, ...meta });
}

const logger = {
  info(message, meta) {
    console.log(format('INFO', message, meta));
  },
  warn(message, meta) {
    console.warn(format('WARN', message, meta));
  },
  error(message, meta) {
    console.error(format('ERROR', message, meta));
  },
};

module.exports = logger;
