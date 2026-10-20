/**
 * backend/tests/unit/utils/jwt.test.js
 *
 * Unit tests for JWT creation, claim structure, and verification utilities.
 */

'use strict';

const jwt = require('jsonwebtoken');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  _getSecret,
} = require('../../../src/utils/jwt');

describe('Utils: jwt.js', () => {
  const secret = _getSecret();

  describe('signAccessToken', () => {
    it('should sign a valid JWT containing sub, role, and type=access', () => {
      const token = signAccessToken({ id: 42, role: 'FACULTY' });
      const decoded = jwt.decode(token);

      expect(decoded.sub).toBe('42');
      expect(decoded.role).toBe('FACULTY');
      expect(decoded.type).toBe('access');
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it('should strictly exclude sensitive credentials or email from token payload', () => {
      const token = signAccessToken({ id: 42, role: 'STUDENT' });
      const decoded = jwt.decode(token);

      expect(decoded.password).toBeUndefined();
      expect(decoded.password_hash).toBeUndefined();
      expect(decoded.email).toBeUndefined();
    });

    it('should throw if id or role is missing', () => {
      expect(() => signAccessToken({ id: 1 })).toThrow(/payload must contain id and role/);
      expect(() => signAccessToken({ role: 'ADMIN' })).toThrow(/payload must contain id and role/);
      expect(() => signAccessToken(null)).toThrow();
    });
  });

  describe('signRefreshToken', () => {
    it('should sign a refresh token with minimal claims and unique jti', () => {
      const token1 = signRefreshToken({ id: 42 });
      const token2 = signRefreshToken({ id: 42 });

      const decoded1 = jwt.decode(token1);
      const decoded2 = jwt.decode(token2);

      expect(decoded1.sub).toBe('42');
      expect(decoded1.type).toBe('refresh');
      expect(decoded1.role).toBeUndefined(); // Refresh token has no role claim
      expect(decoded1.jti).toBeDefined();
      expect(decoded1.jti).not.toBe(decoded2.jti); // Each refresh token has unique jti
    });

    it('should throw if id is missing', () => {
      expect(() => signRefreshToken({})).toThrow(/payload must contain id/);
    });
  });

  describe('verifyAccessToken', () => {
    it('should successfully verify and decode a valid access token', () => {
      const token = signAccessToken({ id: 99, role: 'ADMIN' });
      const decoded = verifyAccessToken(token);

      expect(decoded.sub).toBe('99');
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.type).toBe('access');
    });

    it('should reject a tampered token with JsonWebTokenError', () => {
      const token = signAccessToken({ id: 99, role: 'ADMIN' });
      const tampered = token.slice(0, -5) + 'xxxxx';
      expect(() => verifyAccessToken(tampered)).toThrow(jwt.JsonWebTokenError);
    });

    it('should reject a token signed with wrong secret', () => {
      const wrongToken = jwt.sign(
        { sub: '99', role: 'ADMIN', type: 'access' },
        'wrong-secret-key-32-chars-long-abcde'
      );
      expect(() => verifyAccessToken(wrongToken)).toThrow(jwt.JsonWebTokenError);
    });

    it('should reject a refresh token presented to verifyAccessToken', () => {
      const refToken = signRefreshToken({ id: 99 });
      expect(() => verifyAccessToken(refToken)).toThrow(/Token type mismatch/);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should successfully verify a valid refresh token', () => {
      const refToken = signRefreshToken({ id: 88 });
      const decoded = verifyRefreshToken(refToken);

      expect(decoded.sub).toBe('88');
      expect(decoded.type).toBe('refresh');
    });

    it('should reject an access token presented to verifyRefreshToken', () => {
      const accToken = signAccessToken({ id: 88, role: 'STUDENT' });
      expect(() => verifyRefreshToken(accToken)).toThrow(/Token type mismatch/);
    });
  });
});
