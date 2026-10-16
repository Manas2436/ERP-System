/**
 * backend/src/utils/password.js
 *
 * Password hashing and comparison utilities using bcryptjs.
 *
 * Design decisions:
 *  - Cost factor (BCRYPT_ROUNDS) defaults to 12 in production, 10 in development.
 *    12 rounds is the minimum recommended for bcrypt as of 2024.
 *    The value may be raised without breaking existing hashes (comparison
 *    reads the factor embedded in the stored hash string).
 *  - Never logs or returns plaintext passwords or hash strings.
 *  - Async operations only — synchronous bcrypt blocks the event loop.
 *  - Uses bcryptjs (pure-JS) for zero native-binding dependencies.
 *
 * Usage:
 *   const { hashPassword, comparePassword } = require('./password');
 *   const hash = await hashPassword('plaintextPassword');
 *   const isValid = await comparePassword('plaintextPassword', hash);
 */

'use strict';

const bcrypt = require('bcryptjs');
const env    = require('../config/env');

/**
 * Cost factor for bcrypt work factor (number of rounds).
 * Lower in test/development to keep test suites fast; higher in production.
 */
const BCRYPT_ROUNDS = (() => {
  const fromEnv = parseInt(process.env.BCRYPT_ROUNDS, 10);
  if (!isNaN(fromEnv) && fromEnv >= 10 && fromEnv <= 14) return fromEnv;
  return env.NODE_ENV === 'production' ? 12 : 10;
})();

/**
 * Hash a plaintext password.
 *
 * @param {string} plaintext  The raw password provided by the user.
 * @returns {Promise<string>} The bcrypt hash string (includes salt + factor).
 * @throws  {Error}           If plaintext is missing or not a string.
 */
async function hashPassword(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('hashPassword: plaintext must be a non-empty string.');
  }
  // bcrypt truncates at 72 bytes — acceptable for typical passwords.
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored bcrypt hash.
 *
 * @param {string} plaintext  The raw password to verify.
 * @param {string} hash       The stored bcrypt hash string from the database.
 * @returns {Promise<boolean>} true if the password matches, false otherwise.
 * @throws  {Error}           If either argument is missing or not a string.
 */
async function comparePassword(plaintext, hash) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('comparePassword: plaintext must be a non-empty string.');
  }
  if (!hash || typeof hash !== 'string') {
    throw new Error('comparePassword: hash must be a non-empty string.');
  }
  return bcrypt.compare(plaintext, hash);
}

module.exports = { hashPassword, comparePassword, BCRYPT_ROUNDS };
