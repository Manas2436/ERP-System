/**
 * backend/tests/unit/middleware/middleware.test.js
 *
 * Unit tests for backend middleware components:
 * - verifyToken
 * - requireRole
 * - createRateLimiter
 * - errorHandler
 * - notFound
 */

'use strict';

const { verifyToken, requireRole, createRateLimiter, errorHandler, notFound, ALLOWED_ROLES } = require('../../../src/middleware');
const { signAccessToken, signRefreshToken } = require('../../../src/utils/jwt');

function createMockReqRes(headers = {}, user = null) {
  const req = {
    headers: { ...headers },
    user,
    method: 'GET',
    originalUrl: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = {
    statusCode: null,
    jsonBody: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
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

describe('Middleware: verifyToken', () => {
  it('should attach req.user and call next() for a valid access token', () => {
    const token = signAccessToken({ id: 101, role: 'FACULTY' });
    const { req, res } = createMockReqRes({ authorization: `Bearer ${token}` });
    let nextCalled = false;

    verifyToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('101');
    expect(req.user.role).toBe('FACULTY');
  });

  it('should return 401 when Authorization header is missing', () => {
    const { req, res } = createMockReqRes();
    let nextCalled = false;

    verifyToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.message).toMatch(/authorization header is missing/i);
  });

  it('should return 401 for non-Bearer schemes', () => {
    const { req, res } = createMockReqRes({ authorization: 'Basic dXNlcjpwYXNz' });
    let nextCalled = false;

    verifyToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for refresh tokens presented to access token verification', () => {
    const refreshToken = signRefreshToken({ id: 101 });
    const { req, res } = createMockReqRes({ authorization: `Bearer ${refreshToken}` });
    let nextCalled = false;

    verifyToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.message).toMatch(/invalid token/i);
  });

  it('should return 401 for tampered tokens', () => {
    const { req, res } = createMockReqRes({ authorization: 'Bearer invalid.tampered.token' });
    let nextCalled = false;

    verifyToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe('Middleware: requireRole', () => {
  it('should call next() when user role matches', () => {
    const middleware = requireRole('ADMIN');
    const { req, res } = createMockReqRes({}, { id: '1', role: 'ADMIN' });
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should call next() when user has one of multiple allowed roles', () => {
    const middleware = requireRole('ADMIN', 'FACULTY');
    const { req, res } = createMockReqRes({}, { id: '2', role: 'FACULTY' });
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should return 403 when user role is not permitted', () => {
    const middleware = requireRole('ADMIN');
    const { req, res } = createMockReqRes({}, { id: '3', role: 'STUDENT' });
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.message).toBe('You do not have permission to access this resource.');
  });

  it('should return 401 when req.user is absent', () => {
    const middleware = requireRole('ADMIN');
    const { req, res } = createMockReqRes({}, null);
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('should throw an error during registration if no roles are supplied', () => {
    expect(() => requireRole()).toThrow(/at least one role must be specified/i);
  });

  it('should throw an error during registration if an invalid role is supplied', () => {
    expect(() => requireRole('SUPERUSER')).toThrow(/not a recognized role/i);
  });
});

describe('Middleware: createRateLimiter', () => {
  it('should allow requests within limit and set RateLimit headers', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, message: 'Too many requests' });
    const { req, res } = createMockReqRes();
    let nextCount = 0;

    limiter(req, res, () => { nextCount++; });
    expect(nextCount).toBe(1);
    expect(res.getHeader('x-ratelimit-limit')).toBe(2);
    expect(res.getHeader('x-ratelimit-remaining')).toBe(1);

    limiter(req, res, () => { nextCount++; });
    expect(nextCount).toBe(2);
    expect(res.getHeader('x-ratelimit-remaining')).toBe(0);

    limiter(req, res, () => { nextCount++; });
    expect(nextCount).toBe(2); // not called
    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.success).toBe(false);
  });
});

describe('Middleware: notFound', () => {
  it('should return 404 with standard envelope', () => {
    const { req, res } = createMockReqRes();
    req.method = 'GET';
    req.originalUrl = '/non-existent-route';

    notFound(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.message).toContain('/non-existent-route');
  });
});

describe('Middleware: errorHandler', () => {
  it('should format standard error envelope with status code', () => {
    const { req, res } = createMockReqRes();
    const err = new Error('Custom validation error');
    err.statusCode = 422;

    errorHandler(err, req, res, () => {});

    expect(res.statusCode).toBe(422);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.message).toBe('Custom validation error');
  });

  it('should default to 500 when error statusCode is not set', () => {
    const { req, res } = createMockReqRes();
    const err = new Error('Unhandled exception');

    errorHandler(err, req, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
  });
});
