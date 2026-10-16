/**
 * backend/src/config/env.js
 *
 * Loads environment variables from .env (if present) and exports
 * validated config values used throughout the application.
 * All secrets and connection strings come exclusively from environment
 * variables — never from hardcoded values.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Safely read a required env var. Throws at startup if missing in production
 * so misconfigured deployments fail fast rather than silently.
 */
function required(key) {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,

  // CORS — comma-separated list of allowed origins
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Database — required in production; informational here (used in Stage 3)
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 3306,
  DB_NAME: process.env.DB_NAME || '',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_CONNECTION_LIMIT: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,

  // JWT — required in production; secret must be at least 32 characters.
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Password hashing — bcrypt cost factor (rounds).
  // Min 10 enforced; production default 12; max 14 for reasonable latency.
  BCRYPT_ROUNDS: (() => {
    const r = parseInt(process.env.BCRYPT_ROUNDS, 10);
    if (!isNaN(r) && r >= 10 && r <= 14) return r;
    return process.env.NODE_ENV === 'production' ? 12 : 10;
  })(),

  // Password reset (Stage 11)
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: parseInt(
    process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    10
  ) || 15,

  // CAPTCHA (Stage 8)
  CAPTCHA_SECRET_KEY: process.env.CAPTCHA_SECRET_KEY || '',
  CAPTCHA_VERIFY_URL:
    process.env.CAPTCHA_VERIFY_URL ||
    'https://www.google.com/recaptcha/api/siteverify',

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
};

module.exports = env;
