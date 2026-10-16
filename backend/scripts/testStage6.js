/**
 * backend/scripts/testStage6.js
 *
 * Automated test suite for Stage 6 — Backend Security Foundation.
 *
 * Tests:
 *   1. Password utilities (hashPassword, comparePassword)
 *   2. JWT utilities (signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken)
 *   3. verifyToken middleware — bearer extraction and error responses
 *   4. requireRole middleware — allow/deny logic and startup validation
 *   5. Regression: Stage 5 stored objects still pass (spot-check health only)
 *   6. Regression: GET /api/health still returns 200 + database.status connected
 *
 * Uses Node.js built-in test runner (node:test) — no extra test framework needed.
 * Test-only secrets are used; production .env is not read by this suite.
 *
 * Run with:
 *   npm run test:stage6
 */

'use strict';

process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'test-secret-for-stage6-suite-minimum-32-chars-ok';
process.env.BCRYPT_ROUNDS = '4'; // Minimum rounds accepted; fast for tests (not default 10+)

// ── Import built-in test runner ───────────────────────────────────────────────
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// ── Application modules ───────────────────────────────────────────────────────
// env must be required first so the test env vars above are active
const env            = require('../src/config/env');
const { hashPassword, comparePassword, BCRYPT_ROUNDS } = require('../src/utils/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../src/utils/jwt');
const jwt            = require('jsonwebtoken');

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Build a minimal mock Express request object.
 * @param {string|undefined} authHeader
 */
function mockReq(authHeader) {
  return {
    headers        : authHeader ? { authorization: authHeader } : {},
    originalUrl    : '/test-route',
    user           : undefined,
  };
}

/**
 * Build a minimal mock Express response that captures the JSON sent.
 */
function mockRes() {
  const res = {
    _status : null,
    _body   : null,
  };
  res.status = (code) => { res._status = code; return res; };
  res.json   = (body) => { res._body   = body; return res; };
  return res;
}

// ── Test 1: env.js — BCRYPT_ROUNDS configured correctly ──────────────────────
describe('env.js — BCRYPT_ROUNDS', () => {
  test('BCRYPT_ROUNDS is a number >= 10 in normal conditions', () => {
    // In test env BCRYPT_ROUNDS=4 but the env module clamps to valid range (10-14).
    // Our password.js reads process.env.BCRYPT_ROUNDS directly and applies the
    // same clamping, resulting in 10 as the fallback since 4 < 10.
    assert.ok(typeof env.BCRYPT_ROUNDS === 'number', 'BCRYPT_ROUNDS should be a number');
    assert.ok(env.BCRYPT_ROUNDS >= 10 && env.BCRYPT_ROUNDS <= 14,
      `BCRYPT_ROUNDS ${env.BCRYPT_ROUNDS} should be 10-14`);
  });
});

// ── Test 2: Password utilities ────────────────────────────────────────────────
describe('password.js — hashPassword', () => {
  test('returns a bcrypt hash string starting with $2', async () => {
    const hash = await hashPassword('MyPassword123!');
    assert.match(hash, /^\$2[ab]\$/, 'hash must be a bcrypt hash');
  });

  test('each call produces a different hash (unique salt)', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    assert.notEqual(h1, h2, 'same plaintext must produce different hashes');
  });

  test('throws on empty string input', async () => {
    await assert.rejects(
      () => hashPassword(''),
      { message: /non-empty string/ }
    );
  });

  test('throws on null input', async () => {
    await assert.rejects(
      () => hashPassword(null),
      { message: /non-empty string/ }
    );
  });

  test('does NOT log or return the plaintext (basic check)', async () => {
    // Just confirms the returned value is a hash, not the input
    const plaintext = 'SuperSecret!!99';
    const hash = await hashPassword(plaintext);
    assert.notEqual(hash, plaintext);
    assert.ok(hash.length > 20, 'hash should be a long string');
  });
});

describe('password.js — comparePassword', () => {
  test('returns true for correct plaintext against its hash', async () => {
    const plaintext = 'CorrectPassword!';
    const hash = await hashPassword(plaintext);
    const result = await comparePassword(plaintext, hash);
    assert.equal(result, true);
  });

  test('returns false for wrong plaintext', async () => {
    const hash = await hashPassword('CorrectPassword!');
    const result = await comparePassword('WrongPassword!', hash);
    assert.equal(result, false);
  });

  test('returns false for empty string vs valid hash', async () => {
    const hash = await hashPassword('SomePassword');
    const result = await comparePassword('', hash).catch(() => false);
    // Either throws or returns false — both are acceptable rejections
    assert.equal(result, false);
  });

  test('throws on null plaintext', async () => {
    const hash = await hashPassword('anything');
    await assert.rejects(
      () => comparePassword(null, hash),
      { message: /non-empty string/ }
    );
  });

  test('throws on null hash', async () => {
    await assert.rejects(
      () => comparePassword('something', null),
      { message: /non-empty string/ }
    );
  });
});

// ── Test 3: JWT utilities ─────────────────────────────────────────────────────
describe('jwt.js — signAccessToken', () => {
  test('returns a string with three dot-separated parts', () => {
    const token = signAccessToken({ id: 42, role: 'ADMIN' });
    const parts = token.split('.');
    assert.equal(parts.length, 3, 'JWT must have header.payload.signature');
  });

  test('payload contains sub, role, type=access, iat, exp', () => {
    const token = signAccessToken({ id: 99, role: 'FACULTY' });
    const decoded = jwt.decode(token);
    assert.equal(decoded.sub, '99');
    assert.equal(decoded.role, 'FACULTY');
    assert.equal(decoded.type, 'access');
    assert.ok(decoded.iat, 'iat must be present');
    assert.ok(decoded.exp, 'exp must be present');
  });

  test('does NOT include password, hash, or email in payload', () => {
    const token = signAccessToken({ id: 1, role: 'STUDENT' });
    const decoded = jwt.decode(token);
    assert.equal(decoded.password, undefined);
    assert.equal(decoded.password_hash, undefined);
    assert.equal(decoded.email, undefined);
  });

  test('throws if id is missing', () => {
    assert.throws(
      () => signAccessToken({ role: 'ADMIN' }),
      { message: /id and role/ }
    );
  });

  test('throws if role is missing', () => {
    assert.throws(
      () => signAccessToken({ id: 1 }),
      { message: /id and role/ }
    );
  });
});

describe('jwt.js — verifyAccessToken', () => {
  test('returns decoded payload for a valid token', () => {
    const token = signAccessToken({ id: 7, role: 'STUDENT' });
    const decoded = verifyAccessToken(token);
    assert.equal(decoded.sub, '7');
    assert.equal(decoded.role, 'STUDENT');
    assert.equal(decoded.type, 'access');
  });

  test('throws JsonWebTokenError for a tampered token', () => {
    const token = signAccessToken({ id: 1, role: 'ADMIN' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    assert.throws(
      () => verifyAccessToken(tampered),
      (err) => err instanceof jwt.JsonWebTokenError
    );
  });

  test('throws JsonWebTokenError for a token signed with a different secret', () => {
    const foreignToken = jwt.sign(
      { sub: '1', role: 'ADMIN', type: 'access' },
      'completely-different-secret-value-here',
      { algorithm: 'HS256' }
    );
    assert.throws(
      () => verifyAccessToken(foreignToken),
      (err) => err instanceof jwt.JsonWebTokenError
    );
  });

  test('throws TokenExpiredError for an already-expired token', () => {
    const expired = jwt.sign(
      { sub: '1', role: 'ADMIN', type: 'access' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 } // already expired
    );
    assert.throws(
      () => verifyAccessToken(expired),
      (err) => err instanceof jwt.TokenExpiredError
    );
  });

  test('rejects a refresh token presented as an access token (type mismatch)', () => {
    const refreshToken = signRefreshToken({ id: 5 });
    assert.throws(
      () => verifyAccessToken(refreshToken),
      (err) => err instanceof jwt.JsonWebTokenError
    );
  });
});

describe('jwt.js — signRefreshToken & verifyRefreshToken', () => {
  test('refresh token does not include role claim', () => {
    const token = signRefreshToken({ id: 3 });
    const decoded = jwt.decode(token);
    assert.equal(decoded.role, undefined, 'refresh token must not carry role');
    assert.equal(decoded.type, 'refresh');
    assert.equal(decoded.sub, '3');
  });

  test('verifyRefreshToken accepts a valid refresh token', () => {
    const token = signRefreshToken({ id: 3 });
    const decoded = verifyRefreshToken(token);
    assert.equal(decoded.sub, '3');
    assert.equal(decoded.type, 'refresh');
  });

  test('verifyRefreshToken rejects access token (type mismatch)', () => {
    const accessToken = signAccessToken({ id: 1, role: 'ADMIN' });
    assert.throws(
      () => verifyRefreshToken(accessToken),
      (err) => err instanceof jwt.JsonWebTokenError
    );
  });
});

// ── Test 4: verifyToken middleware ────────────────────────────────────────────
describe('verifyToken middleware', () => {
  const verifyToken = require('../src/middleware/verifyToken');

  test('calls next() and sets req.user for a valid Bearer token', (_, done) => {
    const token = signAccessToken({ id: 11, role: 'ADMIN' });
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    verifyToken(req, res, () => {
      assert.deepEqual(req.user, { id: '11', role: 'ADMIN' });
      done();
    });
  });

  test('returns 401 when Authorization header is absent', () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = () => { throw new Error('next() should not be called'); };
    verifyToken(req, res, next);
    assert.equal(res._status, 401);
    assert.equal(res._body.success, false);
    assert.match(res._body.message, /missing/i);
  });

  test('returns 401 for non-Bearer scheme (e.g. "Basic ...")', () => {
    const req = mockReq('Basic dXNlcjpwYXNz');
    const res = mockRes();
    verifyToken(req, res, () => {});
    assert.equal(res._status, 401);
    assert.match(res._body.message, /Bearer/i);
  });

  test('returns 401 for an expired token', () => {
    const expired = jwt.sign(
      { sub: '1', role: 'ADMIN', type: 'access' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 }
    );
    const req = mockReq(`Bearer ${expired}`);
    const res = mockRes();
    verifyToken(req, res, () => {});
    assert.equal(res._status, 401);
    assert.match(res._body.message, /expired/i);
  });

  test('returns 401 for a malformed / tampered token', () => {
    const req = mockReq('Bearer not.a.real.jwt.token');
    const res = mockRes();
    verifyToken(req, res, () => {});
    assert.equal(res._status, 401);
    assert.equal(res._body.success, false);
  });

  test('returns 401 for a refresh token used as access token', () => {
    const refresh = signRefreshToken({ id: 5 });
    const req = mockReq(`Bearer ${refresh}`);
    const res = mockRes();
    verifyToken(req, res, () => {});
    assert.equal(res._status, 401);
  });

  test('does not expose stack traces or secret in error response', () => {
    const req = mockReq('Bearer invalid-token');
    const res = mockRes();
    verifyToken(req, res, () => {});
    const body = JSON.stringify(res._body);
    assert.ok(!body.includes(process.env.JWT_SECRET), 'secret must not appear in response');
    assert.ok(!body.includes('stack'), 'stack trace must not appear in response');
  });
});

// ── Test 5: requireRole middleware ────────────────────────────────────────────
describe('requireRole middleware', () => {
  const requireRole = require('../src/middleware/requireRole');

  test('calls next() when user has the required role', (_, done) => {
    const guard = requireRole('ADMIN');
    const req = { user: { id: '1', role: 'ADMIN' }, originalUrl: '/test' };
    const res = mockRes();
    guard(req, res, () => { done(); });
  });

  test('calls next() when user has one of multiple allowed roles', (_, done) => {
    const guard = requireRole('ADMIN', 'FACULTY');
    const req = { user: { id: '2', role: 'FACULTY' }, originalUrl: '/test' };
    const res = mockRes();
    guard(req, res, () => { done(); });
  });

  test('returns 403 when user role is not in the allowed list', () => {
    const guard = requireRole('ADMIN');
    const req = { user: { id: '3', role: 'STUDENT' }, originalUrl: '/admin' };
    const res = mockRes();
    guard(req, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._body.success, false);
    assert.match(res._body.message, /permission/i);
  });

  test('returns 403 when STUDENT tries to access FACULTY+ADMIN route', () => {
    const guard = requireRole('ADMIN', 'FACULTY');
    const req = { user: { id: '4', role: 'STUDENT' }, originalUrl: '/staff' };
    const res = mockRes();
    guard(req, res, () => {});
    assert.equal(res._status, 403);
  });

  test('returns 401 when verifyToken was not run (req.user absent)', () => {
    const guard = requireRole('ADMIN');
    const req = { headers: {}, originalUrl: '/test' }; // no req.user
    const res = mockRes();
    guard(req, res, () => {});
    assert.equal(res._status, 401);
  });

  test('throws at registration time for an unknown role string', () => {
    assert.throws(
      () => requireRole('SUPERADMIN'),
      { message: /not a recognized role/ }
    );
  });

  test('throws at registration time if no roles are specified', () => {
    assert.throws(
      () => requireRole(),
      { message: /at least one role/ }
    );
  });

  test('does not include role information in 403 response body', () => {
    const guard = requireRole('ADMIN');
    const req = { user: { id: '99', role: 'STUDENT' }, originalUrl: '/test' };
    const res = mockRes();
    guard(req, res, () => {});
    // Body should not expose which roles were required (minimal info disclosure)
    const body = JSON.stringify(res._body);
    assert.ok(!body.includes('ADMIN'), 'required role names must not leak into 403 body');
  });
});

// ── Test 6: Regression — GET /api/health ─────────────────────────────────────
describe('regression — GET /api/health', () => {
  const app  = require('../src/app');
  const pool = require('../src/config/db');
  let server;

  before(() => new Promise((resolve) => {
    server = app.listen(0, resolve);
  }));

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  test('returns HTTP 200 with api.status ok and database.status connected', async () => {
    const port = server.address().port;
    const res  = await fetch(`http://localhost:${port}/api/health`);
    const data = await res.json();

    assert.equal(res.status, 200, 'Health check must return 200');
    assert.equal(data.success, true);
    assert.equal(data.data.api.status, 'ok');
    assert.equal(data.data.database.status, 'connected',
      'database.status must be connected — check .env DB credentials');
  });
});
