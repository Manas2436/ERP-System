/**
 * backend/tests/unit/utils/password.test.js
 *
 * Unit tests for bcrypt password hashing and comparison utilities.
 */

'use strict';

const { hashPassword, comparePassword } = require('../../../src/utils/password');

describe('Utils: password.js', () => {
  describe('hashPassword', () => {
    it('should generate a valid bcrypt hash starting with $2a$ or $2b$', async () => {
      const hash = await hashPassword('SecurePassword123!');
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$/);
    });

    it('should generate distinct salts/hashes for the same plaintext password', async () => {
      const hash1 = await hashPassword('SamePassword123!');
      const hash2 = await hashPassword('SamePassword123!');
      expect(hash1).not.toBe(hash2);
    });

    it('should throw an error if password is empty or non-string', async () => {
      await expect(hashPassword('')).rejects.toThrow();
      await expect(hashPassword(null)).rejects.toThrow();
      await expect(hashPassword(undefined)).rejects.toThrow();
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password and hash', async () => {
      const plaintext = 'CorrectHorseBatteryStaple!1';
      const hash = await hashPassword(plaintext);
      const isMatch = await comparePassword(plaintext, hash);
      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashPassword('RightPassword123!');
      const isMatch = await comparePassword('WrongPassword123!', hash);
      expect(isMatch).toBe(false);
    });

    it('should throw when plaintext or hash is missing', async () => {
      const hash = await hashPassword('RightPassword123!');
      await expect(comparePassword(null, hash)).rejects.toThrow();
      await expect(comparePassword('RightPassword123!', null)).rejects.toThrow();
    });
  });
});
