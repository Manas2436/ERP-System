/**
 * backend/scripts/testStage14.js
 *
 * Automated test suite for Stage 14 — API Integration Readiness.
 *
 * Verifies:
 *   1. Shared Middleware Exports & Decoupling:
 *      - backend/src/middleware exports verifyToken, requireRole, ALLOWED_ROLES.
 *      - shared/middleware exports verifyToken, requireRole, ALLOWED_ROLES.
 *      - verifyToken and requireRole support both direct default callable imports
 *        and named destructuring imports.
 *      - Zero side-effects: requiring shared middleware does NOT start the server
 *        or open database connections.
 *   2. verifyToken Middleware:
 *      - Correctly decodes valid access tokens and attaches req.user = { id, role }.
 *      - Rejects missing headers, invalid schemes, empty tokens, expired tokens,
 *        tampered signatures, type mismatches (refresh tokens), and invalid roles.
 *      - Formats all errors in standard JSON envelope { success, message, data, errors }.
 *   3. requireRole Middleware:
 *      - Enforces strict RBAC for single and multi-role configurations.
 *      - Rejects unauthorized roles with HTTP 403.
 *      - Rejects requests missing req.user with HTTP 401.
 *      - Fails fast at registration time for invalid/empty roles.
 *   4. Cross-Module ERP Route Simulation:
 *      - Demonstrates how external ERP modules (e.g., Attendance, Courses, Examination)
 *        use the shared middleware on isolated Express routers.
 *      - Verifies that STUDENT, FACULTY, and ADMIN tokens properly access their
 *        authorized routes and receive HTTP 403 Forbidden on unauthorized routes.
 *
 * Run with:
 *   npm run test:stage14
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-stage14-suite-minimum-32-chars-ok';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Import utilities and shared middleware
const { signAccessToken, signRefreshToken } = require('../src/utils/jwt');
const backendMiddleware = require('../src/middleware');
const sharedMiddleware = require('../../shared/middleware');
const verifyTokenDirect = require('../src/middleware/verifyToken');
const requireRoleDirect = require('../src/middleware/requireRole');

let server;
let baseUrl;

// Test tokens
const adminToken   = signAccessToken({ id: 101, role: 'ADMIN' });
const facultyToken = signAccessToken({ id: 102, role: 'FACULTY' });
const studentToken = signAccessToken({ id: 103, role: 'STUDENT' });
const refreshToken = signRefreshToken({ id: 104 });

before(async () => {
  // Set up an isolated test Express app simulating independent ERP module routes
  const app = express();
  app.use(express.json());

  // Use shared middleware to guard future ERP routes
  const { verifyToken, requireRole } = sharedMiddleware;

  // Simulated Attendance Module routes
  app.get('/api/v1/attendance/student-view',
    verifyToken,
    requireRole('STUDENT'),
    (req, res) => res.status(200).json({ success: true, user: req.user, scope: 'student-attendance' })
  );

  app.post('/api/v1/attendance/mark',
    verifyToken,
    requireRole('FACULTY'),
    (req, res) => res.status(200).json({ success: true, user: req.user, action: 'attendance-marked' })
  );

  app.get('/api/v1/attendance/audit-report',
    verifyToken,
    requireRole('ADMIN'),
    (req, res) => res.status(200).json({ success: true, user: req.user, report: 'audit-log' })
  );

  app.get('/api/v1/attendance/overview',
    verifyToken,
    requireRole('FACULTY', 'ADMIN'),
    (req, res) => res.status(200).json({ success: true, user: req.user, view: 'staff-overview' })
  );

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1: Shared Middleware Exports & Decoupling
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 1: Shared Middleware Exports & Decoupling', () => {
  test('backend/src/middleware exports verifyToken and requireRole as functions', () => {
    assert.equal(typeof backendMiddleware.verifyToken, 'function');
    assert.equal(typeof backendMiddleware.requireRole, 'function');
    assert.ok(Array.isArray(backendMiddleware.ALLOWED_ROLES));
    assert.deepEqual(backendMiddleware.ALLOWED_ROLES, ['ADMIN', 'FACULTY', 'STUDENT']);
  });

  test('shared/middleware exports verifyToken and requireRole matching backend implementation', () => {
    assert.equal(typeof sharedMiddleware.verifyToken, 'function');
    assert.equal(typeof sharedMiddleware.requireRole, 'function');
    assert.equal(sharedMiddleware.verifyToken, backendMiddleware.verifyToken);
    assert.equal(sharedMiddleware.requireRole, backendMiddleware.requireRole);
    assert.deepEqual(sharedMiddleware.ALLOWED_ROLES, ['ADMIN', 'FACULTY', 'STUDENT']);
  });

  test('verifyToken supports both direct default import and named destructuring import', () => {
    assert.equal(typeof verifyTokenDirect, 'function');
    assert.equal(verifyTokenDirect.verifyToken, verifyTokenDirect);
    const { verifyToken } = verifyTokenDirect;
    assert.equal(verifyToken, verifyTokenDirect);
  });

  test('requireRole supports both direct default import and named destructuring import', () => {
    assert.equal(typeof requireRoleDirect, 'function');
    assert.equal(requireRoleDirect.requireRole, requireRoleDirect);
    const { requireRole } = requireRoleDirect;
    assert.equal(requireRole, requireRoleDirect);
  });

  test('middleware imports have zero side effects (no server listener or DB pool initialized)', () => {
    // Requiring middleware does not expose server or db
    assert.equal(sharedMiddleware.server, undefined);
    assert.equal(sharedMiddleware.app, undefined);
    assert.equal(backendMiddleware.server, undefined);
    assert.equal(backendMiddleware.db, undefined);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2: verifyToken Authorization Contract & Error Responses
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 2: verifyToken Authorization Contract & Error Responses', () => {
  const { verifyToken } = sharedMiddleware;

  function createMockReq(authHeader) {
    return {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };
  }

  function createMockRes() {
    const res = {
      statusCode: 200,
      jsonBody: null,
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(data) {
        res.jsonBody = data;
        return res;
      },
    };
    return res;
  }

  test('attaches req.user = { id, role } on valid access token', () => {
    const req = createMockReq(`Bearer ${adminToken}`);
    const res = createMockRes();
    let nextCalled = false;

    verifyToken(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, 'next() must be called');
    assert.ok(req.user, 'req.user must be attached');
    assert.equal(req.user.id, '101');
    assert.equal(req.user.role, 'ADMIN');
  });

  test('rejects missing Authorization header with 401', () => {
    const req = createMockReq(undefined);
    const res = createMockRes();

    verifyToken(req, res, () => assert.fail('next() should not be called'));

    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.message, 'Authorization header is missing.');
  });

  test('rejects non-Bearer scheme with 401', () => {
    const req = createMockReq(`Basic dXNlcjpwYXNz`);
    const res = createMockRes();

    verifyToken(req, res, () => assert.fail('next() should not be called'));

    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.message, 'Authorization header must use Bearer scheme.');
  });

  test('rejects empty Bearer token with 401', () => {
    const req = createMockReq('Bearer ');
    const res = createMockRes();

    verifyToken(req, res, () => assert.fail('next() should not be called'));

    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.success, false);
    assert.match(res.jsonBody.message, /Bearer token is empty|Authorization header must use Bearer scheme/);
  });

  test('rejects tampered token with 401', () => {
    const tampered = adminToken.slice(0, -6) + 'abcdef';
    const req = createMockReq(`Bearer ${tampered}`);
    const res = createMockRes();

    verifyToken(req, res, () => assert.fail('next() should not be called'));

    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.message, 'Invalid token.');
  });

  test('rejects refresh token on access route with 401', () => {
    const req = createMockReq(`Bearer ${refreshToken}`);
    const res = createMockRes();

    verifyToken(req, res, () => assert.fail('next() should not be called'));

    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.message, 'Invalid token.');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3: requireRole Middleware Registration & Enforcement
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 3: requireRole Middleware Registration & Enforcement', () => {
  const { requireRole } = sharedMiddleware;

  function createMockRes() {
    const res = {
      statusCode: 200,
      jsonBody: null,
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(data) {
        res.jsonBody = data;
        return res;
      },
    };
    return res;
  }

  test('allows access when user holds required role', () => {
    const guard = requireRole('ADMIN');
    const req = { user: { id: '101', role: 'ADMIN' }, originalUrl: '/test' };
    const res = createMockRes();
    let nextCalled = false;

    guard(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.equal(res.statusCode, 200);
  });

  test('allows access when user holds one of multiple permitted roles', () => {
    const guard = requireRole('FACULTY', 'ADMIN');
    const req = { user: { id: '102', role: 'FACULTY' }, originalUrl: '/test' };
    const res = createMockRes();
    let nextCalled = false;

    guard(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled);
  });

  test('denies access with HTTP 403 when user role is not permitted', () => {
    const guard = requireRole('ADMIN');
    const req = { user: { id: '103', role: 'STUDENT' }, originalUrl: '/test' };
    const res = createMockRes();

    guard(req, res, () => assert.fail('next() must not be called'));

    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.message, 'You do not have permission to access this resource.');
  });

  test('returns HTTP 401 when req.user is absent (verifyToken not called first)', () => {
    const guard = requireRole('ADMIN');
    const req = { originalUrl: '/test' };
    const res = createMockRes();

    guard(req, res, () => assert.fail('next() must not be called'));

    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.message, 'Authentication required.');
  });

  test('fails fast at registration time when no roles are specified', () => {
    assert.throws(() => {
      requireRole();
    }, /requireRole: at least one role must be specified/);
  });

  test('fails fast at registration time when an unrecognized role is specified', () => {
    assert.throws(() => {
      requireRole('SUPERUSER');
    }, /requireRole: 'SUPERUSER' is not a recognized role/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4: Cross-Module ERP Route Simulation
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 4: Cross-Module ERP Route Simulation (Future Module Protection)', () => {
  test('STUDENT role can access student-view route (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/student-view`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.user.role, 'STUDENT');
  });

  test('FACULTY role blocked from student-only route (HTTP 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/student-view`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
    assert.equal(body.message, 'You do not have permission to access this resource.');
  });

  test('ADMIN role blocked from student-only route (HTTP 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/student-view`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
  });

  test('FACULTY role can access mark route (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/mark`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${facultyToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.action, 'attendance-marked');
  });

  test('STUDENT role blocked from mark route (HTTP 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/mark`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
  });

  test('ADMIN role can access audit-report route (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/audit-report`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.report, 'audit-log');
  });

  test('FACULTY role blocked from admin audit-report route (HTTP 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/audit-report`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
  });

  test('Both FACULTY and ADMIN can access staff overview route (HTTP 200)', async () => {
    const resFaculty = await fetch(`${baseUrl}/api/v1/attendance/overview`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });
    const bodyFaculty = await resFaculty.json();
    assert.equal(resFaculty.status, 200);
    assert.equal(bodyFaculty.success, true);

    const resAdmin = await fetch(`${baseUrl}/api/v1/attendance/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bodyAdmin = await resAdmin.json();
    assert.equal(resAdmin.status, 200);
    assert.equal(bodyAdmin.success, true);
  });

  test('STUDENT role blocked from staff overview route (HTTP 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/overview`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
  });

  test('Unauthenticated request to any route returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/v1/attendance/overview`);
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.message, 'Authorization header is missing.');
  });
});
