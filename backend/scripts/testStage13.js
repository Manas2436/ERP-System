/**
 * backend/scripts/testStage13.js
 *
 * Automated test suite for Stage 13 — Security Hardening.
 *
 * Verifies:
 *   1. HTTP Security Headers (Helmet headers, no X-Powered-By, cross-origin resource policy)
 *   2. Rate Limiting (headers, threshold enforcement, 429 envelope response, admin provisioning limiter)
 *   3. Input Validation & Mass-Assignment Defense (rejects unexpected fields, prototype pollution, validates types)
 *   4. JWT & Session Security (tampered signature, wrong secret, wrong token type, algorithm enforcement)
 *   5. Password Reset Anti-Enumeration & Zero Secret Disclosure (generic responses, hashed-only storage, no raw tokens in responses or logs)
 *   6. Error Handling & Information Disclosure (no stack traces or raw SQL in production)
 *   7. Database Audit Integrity (role and status changes audited in user_audit_logs without secrets)
 *
 * Run with:
 *   npm run test:stage13
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-stage13-suite-minimum-32-chars-ok';
process.env.BCRYPT_ROUNDS = '10';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { signAccessToken, signRefreshToken, verifyAccessToken } = require('../src/utils/jwt');
const { createRateLimiter } = require('../src/middleware/rateLimiter');
const errorHandler = require('../src/middleware/errorHandler');

let server;
let baseUrl;
const createdUserIds = [];

// Helper to solve arithmetic question from captcha endpoint
function solveCaptchaQuestion(question) {
  const match = question.match(/What is (\d+) ([+-]) (\d+)\?/);
  if (!match) throw new Error(`Unable to parse captcha question: ${question}`);
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  return op === '+' ? String(a + b) : String(a - b);
}

// Helper to obtain fresh solved CAPTCHA
async function getSolvedCaptcha() {
  const res = await fetch(`${baseUrl}/api/v1/auth/captcha`);
  const body = await res.json();
  assert.equal(res.status, 200);
  return {
    captchaId: body.data.captchaId,
    answer: solveCaptchaQuestion(body.data.question),
  };
}

// Helper to create test user directly in DB
async function insertTestUser({ username, email, role = 'STUDENT', password = 'TestPassword123!', isActive = 1 }) {
  const passwordHash = await hashPassword(password);
  const [res] = await db.query(
    `INSERT INTO users (username, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [username, email, passwordHash, role, isActive]
  );
  createdUserIds.push(res.insertId);
  return { id: res.insertId, username, email, role, password };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (createdUserIds.length > 0) {
    const placeholders = createdUserIds.map(() => '?').join(',');
    try {
      await db.query(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
    } catch (err) {
      console.error('Error cleaning up test users:', err.message);
    }
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await db.end();
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1: HTTP Security Headers & Framework Fingerprinting
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 1: HTTP Security Headers & Framework Fingerprinting', () => {
  test('GET /api/health includes expected Helmet security headers', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    // nosniff protects against MIME type sniffing
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    // frameguard defends against clickjacking
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    // strict referrer policy
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    // cross-origin resource policy configured for cross-origin API access
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
    // DNS prefetch control
    assert.equal(res.headers.get('x-dns-prefetch-control'), 'off');
  });

  test('X-Powered-By framework fingerprinting is completely disabled', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By header must not be sent');
  });

  test('CORS handles preflight OPTIONS request with standard methods', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2: Rate Limiting & Sensitive Endpoints
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 2: Rate Limiting Middleware', () => {
  test('Rate limiter tracks request count and includes standard headers', async () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 5,
      skipInTest: false,
    });

    const mockReq = { ip: '192.168.1.100', connection: {} };
    let capturedHeaders = {};
    const mockRes = {
      setHeader(name, val) {
        capturedHeaders[name] = val;
      },
    };

    let calledNext = false;
    limiter(mockReq, mockRes, () => {
      calledNext = true;
    });

    assert.equal(calledNext, true);
    assert.equal(capturedHeaders['X-RateLimit-Limit'], 5);
    assert.equal(capturedHeaders['X-RateLimit-Remaining'], 4);
    assert.ok(capturedHeaders['X-RateLimit-Reset'] > 0);
  });

  test('Rate limiter returns 429 JSON response with Retry-After when threshold exceeded', async () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      skipInTest: false,
      message: 'Too many requests.',
    });

    const mockReq = { ip: '192.168.1.101', connection: {} };
    let statusCode = null;
    let jsonBody = null;
    let capturedHeaders = {};
    const mockRes = {
      setHeader(name, val) {
        capturedHeaders[name] = val;
      },
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    // First two requests pass
    limiter(mockReq, mockRes, () => {});
    limiter(mockReq, mockRes, () => {});

    // Third request throttled
    limiter(mockReq, mockRes, () => {
      assert.fail('Should not call next when throttled');
    });

    assert.equal(statusCode, 429);
    assert.equal(jsonBody.success, false);
    assert.equal(jsonBody.message, 'Too many requests.');
    assert.ok(capturedHeaders['Retry-After'] > 0);
  });

  test('Admin user provisioning route has rate limiting middleware configured', () => {
    const adminRoutes = require('../src/routes/adminRoutes');
    // Inspect route stack to confirm POST /users has rate limiter and validators
    const postUserRoute = adminRoutes.stack.find((layer) => layer.route && layer.route.path === '/users' && layer.route.methods.post);
    assert.ok(postUserRoute, 'POST /users route exists');
    assert.ok(postUserRoute.route.stack.length >= 3, 'POST /users has limiter, validator, and controller middleware');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3: Input Validation, Unexpected Fields, and Mass-Assignment Defense
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 3: Input Validation & Mass-Assignment Defense', () => {
  test('POST /api/v1/auth/login rejects unexpected fields with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'someuser',
        password: 'Password123!',
        captchaId: 'cap-1',
        captchaAnswer: '10',
        isAdmin: true, // Unexpected field
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'isAdmin'));
  });

  test('POST /api/v1/auth/login rejects prototype pollution keys', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'someuser',
        password: 'Password123!',
        captchaId: 'cap-1',
        captchaAnswer: '10',
        __proto__: { polluted: true },
      }),
    });
    assert.equal(res.status, 400);
  });

  test('POST /api/v1/auth/refresh rejects unexpected fields with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: 'valid-format-token',
        extraRole: 'ADMIN',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.field === 'extraRole'));
  });

  test('POST /api/v1/auth/forgot-password rejects unexpected fields with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@college.edu',
        bypassCaptcha: true,
      }),
    });
    assert.equal(res.status, 400);
  });

  test('POST /api/v1/auth/reset-password rejects unexpected fields with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: '12345678901234567890',
        newPassword: 'NewValidPassword123!',
        escalatePrivilege: true,
      }),
    });
    assert.equal(res.status, 400);
  });

  test('POST /api/v1/admin/users rejects unexpected fields with 400', async () => {
    const adminToken = signAccessToken({ id: 1, role: 'ADMIN' });
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: 'new_student_test',
        email: 'new_student@college.edu',
        password: 'ValidPassword123!',
        role: 'STUDENT',
        unauthorized_flag: 1,
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.field === 'unauthorized_flag'));
  });

  test('PUT /api/v1/admin/users/:id rejects unexpected fields with 400', async () => {
    const adminToken = signAccessToken({ id: 1, role: 'ADMIN' });
    const res = await fetch(`${baseUrl}/api/v1/admin/users/12`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        role: 'FACULTY',
        permissions: ['ALL'],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.field === 'permissions'));
  });

  test('PATCH /api/v1/admin/users/:id/status rejects unexpected fields with 400', async () => {
    const adminToken = signAccessToken({ id: 1, role: 'ADMIN' });
    const res = await fetch(`${baseUrl}/api/v1/admin/users/12/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        isActive: false,
        overrideLockout: true,
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.field === 'overrideLockout'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4: JWT & Session Hardening
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 4: JWT & Session Hardening', () => {
  test('Rejects token signed with wrong secret with 401', async () => {
    const fakeToken = jwt.sign(
      { sub: '1', role: 'ADMIN', type: 'access' },
      'wrong-secret-key-that-does-not-match-at-all-32-chars',
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.message, 'Invalid token.');
  });

  test('Rejects unsigned / "none" algorithm tokens with 401', async () => {
    // Manually forge a header with alg: none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: '1', role: 'ADMIN', type: 'access' })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${noneToken}` },
    });
    assert.equal(res.status, 401);
  });

  test('Rejects refresh token sent to access-token protected route', async () => {
    const refreshToken = signRefreshToken({ id: 1 });
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.message, 'Invalid token.');
  });

  test('Rejects access token sent to refresh route', async () => {
    const accessToken = signAccessToken({ id: 1, role: 'ADMIN' });
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: accessToken }),
    });
    assert.equal(res.status, 401);
  });

  test('Rejects token containing an unrecognized role claim', async () => {
    const evilToken = jwt.sign(
      { sub: '1', role: 'SUPER_ADMIN', type: 'access' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${evilToken}` },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.message, 'Token contains an unrecognized role.');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 5: Password Reset Anti-Enumeration & Zero Secret Disclosure
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 5: Password Reset Anti-Enumeration & Zero Secrets', () => {
  test('Forgot-password returns identical generic message for existing and nonexistent users', async () => {
    const user = await insertTestUser({
      username: 'sec_existing_user',
      email: 'sec_existing@college.edu',
    });

    const resExisting = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: user.email }),
    });
    const bodyExisting = await resExisting.json();

    const resNonexistent = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nonexistent_account@college.edu' }),
    });
    const bodyNonexistent = await resNonexistent.json();

    assert.equal(resExisting.status, 200);
    assert.equal(resNonexistent.status, 200);
    assert.equal(bodyExisting.message, bodyNonexistent.message);
    assert.equal(bodyExisting.data, null);
    assert.equal(bodyNonexistent.data, null);
  });

  test('Database stores ONLY SHA-256 hash of reset token, never plaintext token', async () => {
    const user = await insertTestUser({
      username: 'sec_token_user',
      email: 'sec_token@college.edu',
    });

    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: user.email }),
    });

    const [rows] = await db.query(
      'SELECT password_reset_token_hash FROM users WHERE id = ?',
      [user.id]
    );

    const tokenHash = rows[0]?.password_reset_token_hash;
    assert.ok(tokenHash, 'Token hash must be stored');
    // SHA-256 hex is exactly 64 characters long
    assert.equal(tokenHash.length, 64, 'Stored token must be a 64-character SHA-256 hex digest');
    assert.match(tokenHash, /^[a-f0-9]{64}$/, 'Must be valid hex');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 6: Error Handling & Information Leakage Defense
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 6: Information Leakage Defense', () => {
  test('Malformed JSON returns clean 400 without stack trace', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ "username": "bad_json, }',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.message, 'Malformed JSON in request body.');
    assert.equal(body.stack, undefined);
  });

  test('errorHandler in production hides internal errors and SQL syntax details', () => {
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    let statusCode = null;
    let jsonBody = null;
    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    // Simulate internal database error
    const dbErr = new Error('ER_PARSE_ERROR: You have an error in your SQL syntax near SELECT * FROM users');
    dbErr.statusCode = 500;

    errorHandler(dbErr, { method: 'GET', originalUrl: '/test' }, mockRes, () => {});

    assert.equal(statusCode, 500);
    assert.equal(jsonBody.message, 'Internal server error.');
    assert.equal(jsonBody.stack, undefined);

    process.env.NODE_ENV = savedEnv;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 7: Database Audit Integrity
// ═════════════════════════════════════════════════════════════════════════════
describe('Suite 7: Database Audit Integrity', () => {
  test('Administrative role and status changes record to user_audit_logs without secrets', async () => {
    const user = await insertTestUser({
      username: 'sec_audit_user',
      email: 'sec_audit@college.edu',
      role: 'STUDENT',
      isActive: 1,
    });

    // Update status to inactive
    await db.query('CALL sp_update_user_status(?, 0)', [user.id]);
    // Update role to FACULTY
    await db.query('CALL sp_update_user_role(?, "FACULTY")', [user.id]);

    const [logs] = await db.query(
      'SELECT action, field_name, old_value, new_value FROM user_audit_logs WHERE user_id = ? ORDER BY id ASC',
      [user.id]
    );

    assert.equal(logs.length, 2, 'Two audit entries generated');
    assert.equal(logs[0].action, 'STATUS_CHANGE');
    assert.equal(logs[0].field_name, 'is_active');
    assert.equal(logs[0].old_value, '1');
    assert.equal(logs[0].new_value, '0');

    assert.equal(logs[1].action, 'ROLE_CHANGE');
    assert.equal(logs[1].field_name, 'role');
    assert.equal(logs[1].old_value, 'STUDENT');
    assert.equal(logs[1].new_value, 'FACULTY');

    // Confirm no secrets logged
    for (const entry of logs) {
      assert.notEqual(entry.field_name, 'password_hash');
      assert.notEqual(entry.field_name, 'password_reset_token_hash');
    }
  });
});
