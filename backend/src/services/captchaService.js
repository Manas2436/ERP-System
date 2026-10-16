/**
 * backend/src/services/captchaService.js
 *
 * Server-generated CAPTCHA service with cryptographically secure challenge IDs,
 * short expiration, HMAC-hashed answer storage, single-use verification,
 * and a bounded in-memory store.
 *
 * Security & Design decisions:
 *  - Challenge ID: 32 cryptographically random bytes (64-char hex string).
 *  - Storage: In-memory Map bounded to MAX_STORE_SIZE to avoid unbounded growth / DoS.
 *  - Answer protection: Plaintext answers are never kept in memory; HMAC-SHA256
 *    hashes of normalized answers are stored using a server secret.
 *  - Comparison: crypto.timingSafeEqual is used to prevent timing side-channels.
 *  - Single-use: A challenge is deleted from storage immediately upon retrieval
 *    (preventing replay attacks regardless of whether verification succeeded).
 *  - Expiry: 180 seconds (3 minutes) by default; expired challenges are rejected.
 *  - Store interface: Clear get/set/delete abstraction that can be swapped with Redis
 *    in distributed multi-instance deployments.
 */

'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

const DEFAULT_TTL_SECONDS = 180; // 3 minutes
const MAX_STORE_SIZE = 5000;     // Maximum active challenges to prevent memory exhaustion
const CLEANUP_INTERVAL_MS = 60000; // Sweep expired challenges every 60s

class InMemoryCaptchaStore {
  constructor(maxSize = MAX_STORE_SIZE) {
    this.store = new Map();
    this.maxSize = maxSize;

    // Periodic cleanup of expired challenges
    this.cleanupTimer = setInterval(() => {
      this.purgeExpired();
    }, CLEANUP_INTERVAL_MS);

    // Allow Node process to exit even if this timer is active
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  set(id, data) {
    if (this.store.size >= this.maxSize) {
      // Evict oldest entries when limit reached
      this.purgeExpired();
      if (this.store.size >= this.maxSize) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
    }
    this.store.set(id, data);
  }

  /**
   * Retrieves and IMMEDIATELY deletes the challenge to enforce single-use.
   */
  getAndDelete(id) {
    if (!id || typeof id !== 'string') return null;
    const entry = this.store.get(id);
    if (entry) {
      this.store.delete(id);
    }
    return entry || null;
  }

  purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

// Default in-memory store instance
const defaultStore = new InMemoryCaptchaStore();

/**
 * Normalizes answer for consistent verification (trimmed, lowercase string).
 */
function normalizeAnswer(rawAnswer) {
  if (rawAnswer === null || rawAnswer === undefined) return '';
  return String(rawAnswer).trim().toLowerCase();
}

/**
 * Computes HMAC-SHA256 hash of the normalized answer.
 */
function hashAnswer(normalizedAnswer, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(normalizedAnswer)
    .digest('hex');
}

/**
 * Generates an arithmetic question and answer.
 * Uses integer addition or subtraction with positive results.
 */
function generateChallengeQuestion() {
  const isAddition = Math.random() > 0.5;
  if (isAddition) {
    const a = Math.floor(Math.random() * 20) + 1; // 1 to 20
    const b = Math.floor(Math.random() * 20) + 1; // 1 to 20
    return {
      question: `What is ${a} + ${b}?`,
      expectedAnswer: String(a + b),
    };
  } else {
    const a = Math.floor(Math.random() * 20) + 10; // 10 to 30
    const b = Math.floor(Math.random() * 10) + 1;  // 1 to 10 (a >= b guaranteed)
    return {
      question: `What is ${a} - ${b}?`,
      expectedAnswer: String(a - b),
    };
  }
}

class CaptchaService {
  constructor(store = defaultStore) {
    this.store = store;
  }

  _getSecret() {
    return env.CAPTCHA_SECRET_KEY || env.JWT_SECRET || 'college-erp-captcha-salt';
  }

  /**
   * Generates a new CAPTCHA challenge.
   *
   * @param {number} [ttlSeconds=DEFAULT_TTL_SECONDS]
   * @returns {{ captchaId: string, question: string, expiresInSeconds: number }}
   */
  createChallenge(ttlSeconds = DEFAULT_TTL_SECONDS) {
    const challengeId = crypto.randomBytes(32).toString('hex');
    const { question, expectedAnswer } = generateChallengeQuestion();
    const normalized = normalizeAnswer(expectedAnswer);
    const answerHash = hashAnswer(normalized, this._getSecret());

    const now = Date.now();
    const expiresAt = now + (ttlSeconds * 1000);

    this.store.set(challengeId, {
      answerHash,
      createdAt: now,
      expiresAt,
    });

    return {
      captchaId: challengeId,
      question,
      expiresInSeconds: ttlSeconds,
    };
  }

  /**
   * Verifies and consumes a CAPTCHA challenge.
   *
   * Single-use guarantee: The challenge is removed from the store immediately.
   *
   * @param {string} captchaId
   * @param {string|number} submittedAnswer
   * @returns {{ valid: boolean, reason?: string }}
   */
  verifyChallenge(captchaId, submittedAnswer) {
    if (!captchaId || typeof captchaId !== 'string') {
      return { valid: false, reason: 'CAPTCHA challenge ID is required.' };
    }

    if (submittedAnswer === undefined || submittedAnswer === null || String(submittedAnswer).trim() === '') {
      // Still consume if ID was provided to prevent brute forcing
      this.store.getAndDelete(captchaId);
      return { valid: false, reason: 'CAPTCHA answer is required.' };
    }

    const entry = this.store.getAndDelete(captchaId);
    if (!entry) {
      return { valid: false, reason: 'CAPTCHA challenge not found, expired, or already used.' };
    }

    if (Date.now() > entry.expiresAt) {
      return { valid: false, reason: 'CAPTCHA challenge has expired.' };
    }

    const normalizedSubmitted = normalizeAnswer(submittedAnswer);
    const submittedHash = hashAnswer(normalizedSubmitted, this._getSecret());

    const expectedBuffer = Buffer.from(entry.answerHash, 'hex');
    const submittedBuffer = Buffer.from(submittedHash, 'hex');

    if (expectedBuffer.length !== submittedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, submittedBuffer)) {
      return { valid: false, reason: 'Incorrect CAPTCHA answer.' };
    }

    return { valid: true };
  }
}

const captchaService = new CaptchaService();

module.exports = {
  captchaService,
  CaptchaService,
  InMemoryCaptchaStore,
  generateChallengeQuestion,
  normalizeAnswer,
  hashAnswer,
};
