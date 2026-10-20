/**
 * backend/tests/unit/validations/authValidation.test.js
 *
 * Unit tests for authentication input validation rules and prototype pollution defense.
 */

'use strict';

const {
  checkUnexpectedFields,
  validateLogin,
  validateRefresh,
  validateLogout,
  validateForgotPassword,
  validateResetPassword,
} = require('../../../src/validations/authValidation');

describe('Validations: authValidation.js', () => {
  function createMockReqRes(body = {}) {
    const req = { body };
    const res = {
      statusCode: null,
      jsonBody: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.jsonBody = payload;
        return this;
      },
    };
    return { req, res };
  }

  describe('checkUnexpectedFields', () => {
    it('should return empty errors when only allowed fields are present', () => {
      const errors = checkUnexpectedFields({ a: 1, b: 2 }, ['a', 'b', 'c']);
      expect(errors).toHaveLength(0);
    });

    it('should detect unexpected extra fields', () => {
      const errors = checkUnexpectedFields({ a: 1, role: 'ADMIN' }, ['a']);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('role');
      expect(errors[0].message).toMatch(/Unexpected field 'role'/);
    });

    it('should detect prototype-polluting keys', () => {
      const malicious = JSON.parse('{"__proto__": {"admin": true}, "username": "test"}');
      const errors = checkUnexpectedFields(malicious, ['username']);
      expect(errors.some((e) => e.field === '__proto__')).toBe(true);
    });
  });

  describe('validateLogin', () => {
    it('should call next() for valid login payload', () => {
      const { req, res } = createMockReqRes({
        username: 'valid_user',
        password: 'ValidPassword123!',
        captchaId: '64charhexstring1234567890abcdef1234567890abcdef1234567890abcdef12',
        captchaAnswer: '42',
      });
      let nextCalled = false;
      validateLogin(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBeNull();
    });

    it('should return 400 when unexpected fields are present', () => {
      const { req, res } = createMockReqRes({
        username: 'valid_user',
        password: 'ValidPassword123!',
        captchaId: 'abc',
        captchaAnswer: '42',
        extraField: 'not_allowed',
      });
      let nextCalled = false;
      validateLogin(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.jsonBody.success).toBe(false);
    });

    it('should return 400 when username is too short', () => {
      const { req, res } = createMockReqRes({
        username: 'ab',
        password: 'ValidPassword123!',
        captchaId: 'abc',
        captchaAnswer: '42',
      });
      let nextCalled = false;
      validateLogin(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.jsonBody.errors.some((e) => e.field === 'username')).toBe(true);
    });
  });

  describe('validateRefresh', () => {
    it('should call next() for valid refresh token payload', () => {
      const { req, res } = createMockReqRes({
        refreshToken: 'valid-jwt-token-string',
      });
      let nextCalled = false;
      validateRefresh(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should return 400 when refreshToken is missing', () => {
      const { req, res } = createMockReqRes({});
      let nextCalled = false;
      validateRefresh(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateForgotPassword', () => {
    it('should accept valid email', () => {
      const { req, res } = createMockReqRes({ email: 'user@college.edu' });
      let nextCalled = false;
      validateForgotPassword(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should accept valid username', () => {
      const { req, res } = createMockReqRes({ username: 'valid_username' });
      let nextCalled = false;
      validateForgotPassword(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should reject when both email and username are provided simultaneously', () => {
      const { req, res } = createMockReqRes({ email: 'user@college.edu', username: 'valid_username' });
      let nextCalled = false;
      validateForgotPassword(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.jsonBody.message).toMatch(/provide either email or username, not both/i);
    });

    it('should reject when neither email nor username is provided', () => {
      const { req, res } = createMockReqRes({});
      let nextCalled = false;
      validateForgotPassword(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateResetPassword', () => {
    it('should call next() for valid token and new password', () => {
      const { req, res } = createMockReqRes({
        token: 'valid-reset-token-1234567890',
        newPassword: 'BrandNewSecurePassword123!',
      });
      let nextCalled = false;
      validateResetPassword(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should reject password shorter than 8 characters', () => {
      const { req, res } = createMockReqRes({
        token: 'valid-reset-token-1234567890',
        newPassword: 'short',
      });
      let nextCalled = false;
      validateResetPassword(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.jsonBody.errors.some((e) => e.field === 'newPassword')).toBe(true);
    });
  });
});
