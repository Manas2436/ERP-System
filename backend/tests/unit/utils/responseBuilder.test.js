/**
 * backend/tests/unit/utils/responseBuilder.test.js
 *
 * Unit tests for standardized JSON API response envelopes.
 */

'use strict';

const { success, error } = require('../../../src/utils/responseBuilder');

describe('Utils: responseBuilder.js', () => {
  function createMockResponse() {
    const res = {
      statusCode: null,
      data: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.data = payload;
        return this;
      },
    };
    return res;
  }

  describe('success', () => {
    it('should format standard success response envelope', () => {
      const res = createMockResponse();
      success(res, 200, 'Operation successful.', { count: 5 });

      expect(res.statusCode).toBe(200);
      expect(res.data).toEqual({
        success: true,
        message: 'Operation successful.',
        data: { count: 5 },
        errors: null,
      });
    });

    it('should default data to null if omitted', () => {
      const res = createMockResponse();
      success(res, 201, 'Created.');

      expect(res.statusCode).toBe(201);
      expect(res.data).toEqual({
        success: true,
        message: 'Created.',
        data: null,
        errors: null,
      });
    });
  });

  describe('error', () => {
    it('should format standard error response envelope', () => {
      const res = createMockResponse();
      error(res, 400, 'Validation failed.', [{ field: 'email', message: 'Invalid format.' }]);

      expect(res.statusCode).toBe(400);
      expect(res.data).toEqual({
        success: false,
        message: 'Validation failed.',
        data: null,
        errors: [{ field: 'email', message: 'Invalid format.' }],
      });
    });

    it('should default errors to null if omitted', () => {
      const res = createMockResponse();
      error(res, 401, 'Unauthorized.');

      expect(res.statusCode).toBe(401);
      expect(res.data).toEqual({
        success: false,
        message: 'Unauthorized.',
        data: null,
        errors: null,
      });
    });
  });
});
