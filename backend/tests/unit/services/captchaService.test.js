/**
 * backend/tests/unit/services/captchaService.test.js
 *
 * Unit tests for CAPTCHA challenge creation, HMAC protection, single-use consumption, and expiry.
 */

'use strict';

const {
  CaptchaService,
  InMemoryCaptchaStore,
  normalizeAnswer,
  hashAnswer,
} = require('../../../src/services/captchaService');

describe('Services: captchaService.js', () => {
  describe('normalizeAnswer and hashAnswer', () => {
    it('should trim and lowercase inputs consistently', () => {
      expect(normalizeAnswer('  42  ')).toBe('42');
      expect(normalizeAnswer(' ABC ')).toBe('abc');
      expect(normalizeAnswer(null)).toBe('');
    });

    it('should produce identical HMAC hashes for equivalent normalized answers', () => {
      const hash1 = hashAnswer('42', 'test-secret');
      const hash2 = hashAnswer(normalizeAnswer(' 42 '), 'test-secret');
      expect(hash1).toBe(hash2);
    });
  });

  describe('InMemoryCaptchaStore', () => {
    it('should store and immediately delete challenge on getAndDelete (single-use guarantee)', () => {
      const store = new InMemoryCaptchaStore(10);
      store.set('id1', { answerHash: 'abc', expiresAt: Date.now() + 10000 });

      expect(store.size).toBe(1);
      const retrieved = store.getAndDelete('id1');
      expect(retrieved).toBeDefined();
      expect(retrieved.answerHash).toBe('abc');

      // Second retrieval must return null (already consumed)
      expect(store.getAndDelete('id1')).toBeNull();
      expect(store.size).toBe(0);
    });

    it('should evict expired challenges during purgeExpired', () => {
      const store = new InMemoryCaptchaStore(10);
      store.set('expired1', { answerHash: 'x', expiresAt: Date.now() - 5000 });
      store.set('valid1', { answerHash: 'y', expiresAt: Date.now() + 50000 });

      store.purgeExpired();
      expect(store.getAndDelete('expired1')).toBeNull();
      expect(store.getAndDelete('valid1')).toBeDefined();
    });
  });

  describe('CaptchaService', () => {
    let service;

    beforeEach(() => {
      const store = new InMemoryCaptchaStore(50);
      service = new CaptchaService(store);
    });

    it('should create challenge with valid id and arithmetic question', () => {
      const challenge = service.createChallenge(180);

      expect(challenge.captchaId).toHaveLength(64);
      expect(challenge.question).toMatch(/What is \d+ [+-] \d+\?/);
      expect(challenge.expiresInSeconds).toBe(180);
    });

    it('should verify correct answer and consume the challenge', () => {
      const challenge = service.createChallenge(180);

      // Solve question
      const match = challenge.question.match(/What is (\d+) ([+-]) (\d+)\?/);
      const a = parseInt(match[1], 10);
      const op = match[2];
      const b = parseInt(match[3], 10);
      const expected = op === '+' ? a + b : a - b;

      const result = service.verifyChallenge(challenge.captchaId, String(expected));
      expect(result.valid).toBe(true);

      // Re-verifying must fail because challenge was consumed
      const replay = service.verifyChallenge(challenge.captchaId, String(expected));
      expect(replay.valid).toBe(false);
      expect(replay.reason).toMatch(/already used|not found/i);
    });

    it('should reject incorrect answer and still consume the challenge', () => {
      const challenge = service.createChallenge(180);

      const result = service.verifyChallenge(challenge.captchaId, '999999');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/incorrect/i);

      // Ensure consumed on failure to prevent brute forcing
      const retry = service.verifyChallenge(challenge.captchaId, '999999');
      expect(retry.valid).toBe(false);
      expect(retry.reason).toMatch(/already used|not found/i);
    });

    it('should reject expired challenge', () => {
      // Create with negative TTL so it is already expired
      const challenge = service.createChallenge(-10);

      const result = service.verifyChallenge(challenge.captchaId, '42');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/expired/i);
    });
  });
});
