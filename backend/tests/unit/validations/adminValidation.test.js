/**
 * backend/tests/unit/validations/adminValidation.test.js
 *
 * Unit tests for administrative user-management input validation.
 */

'use strict';

const {
  validateListUsers,
  validateCreateUser,
  validateUpdateRole,
  validateUpdateStatus,
  validateUserId,
} = require('../../../src/validations/adminValidation');

describe('Validations: adminValidation.js', () => {
  function createMockReqRes(body = {}, query = {}, params = {}) {
    const req = { body, query, params };
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

  describe('validateListUsers', () => {
    it('should allow valid pagination parameters and role filters', () => {
      const { req, res } = createMockReqRes({}, { page: '2', pageSize: '25', role: 'FACULTY', status: 'active' });
      let nextCalled = false;
      validateListUsers(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(req.query.page).toBe(2);
      expect(req.query.pageSize).toBe(25);
    });

    it('should reject invalid page (< 1)', () => {
      const { req, res } = createMockReqRes({}, { page: '0' });
      let nextCalled = false;
      validateListUsers(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });

    it('should reject pageSize exceeding 100', () => {
      const { req, res } = createMockReqRes({}, { pageSize: '101' });
      let nextCalled = false;
      validateListUsers(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateCreateUser', () => {
    it('should call next() for valid user provisioning body', () => {
      const { req, res } = createMockReqRes({
        username: 'new_faculty',
        email: 'faculty@college.edu',
        password: 'SecurePassword123!',
        role: 'FACULTY',
      });
      let nextCalled = false;
      validateCreateUser(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should reject invalid role string', () => {
      const { req, res } = createMockReqRes({
        username: 'new_faculty',
        email: 'faculty@college.edu',
        password: 'SecurePassword123!',
        role: 'SUPERADMIN',
      });
      let nextCalled = false;
      validateCreateUser(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid email format', () => {
      const { req, res } = createMockReqRes({
        username: 'new_faculty',
        email: 'not-an-email',
        password: 'SecurePassword123!',
        role: 'FACULTY',
      });
      let nextCalled = false;
      validateCreateUser(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateUserId', () => {
    it('should allow positive integer id param', () => {
      const { req, res } = createMockReqRes({}, {}, { id: '42' });
      let nextCalled = false;
      validateUserId(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(req.params.parsedId).toBe(42);
    });

    it('should reject non-numeric id param', () => {
      const { req, res } = createMockReqRes({}, {}, { id: 'abc' });
      let nextCalled = false;
      validateUserId(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateUpdateRole', () => {
    it('should allow valid role update', () => {
      const { req, res } = createMockReqRes({ role: 'ADMIN' });
      let nextCalled = false;
      validateUpdateRole(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should reject unknown role update', () => {
      const { req, res } = createMockReqRes({ role: 'TEACHER' });
      let nextCalled = false;
      validateUpdateRole(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('validateUpdateStatus', () => {
    it('should allow boolean true/false or integer 1/0', () => {
      const { req: req1, res: res1 } = createMockReqRes({ isActive: false });
      let next1 = false;
      validateUpdateStatus(req1, res1, () => { next1 = true; });
      expect(next1).toBe(true);
      expect(req1.body.normalizedStatus).toBe(0);

      const { req: req2, res: res2 } = createMockReqRes({ isActive: 1 });
      let next2 = false;
      validateUpdateStatus(req2, res2, () => { next2 = true; });
      expect(next2).toBe(true);
      expect(req2.body.normalizedStatus).toBe(1);
    });

    it('should reject invalid status string', () => {
      const { req, res } = createMockReqRes({ isActive: 'active' });
      let nextCalled = false;
      validateUpdateStatus(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
    });
  });
});
