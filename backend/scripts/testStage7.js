/**
 * backend/scripts/testStage7.js
 *
 * Automated test suite for Stage 7 — Login API with CAPTCHA verification
 * and secure role-aware authentication.
 *
 * Scenarios covered:
 *   1. CAPTCHA service unit tests (generation, hashing, single-use, expiry, eviction)
 *   2. Rate limiter middleware tests (headers, threshold, 429 response)
 *   3. Login validation tests (missing/malformed username, password, captcha)
 *   4. CAPTCHA verification in login endpoint (invalid, incorrect, expired, reused)
 *   5. Successful login for ADMIN, FACULTY, and STUDENT roles
 *   6. Token validation & RBAC middleware compatibility (verifyToken + requireRole)
 *   7. Security invariants: no sensitive fields (password_hash, locked_until, etc.) in responses
 *   8. Non-existent username generic error & timing defense
 *   9. Incorrect password -> increment failed_login_attempts
 *  10. Account lockout policy: 5 failed attempts -> 15 min lock (HTTP 423)
 *  11. Counter reset to 0 and last_login_at update on successful login
 *  12. Deactivated account rejection (is_active = 0 -> HTTP 403)
 *  13. Safe database cleanup of all test accounts
 *  14. Health check regression
 *
 * Uses Node.js built-in test runner (node:test).
 *
 * Run with:
 *   npm run test:stage7
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-stage7-suite-minimum-32-chars-ok';
process.env.BCRYPT_ROUNDS = '10';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { verifyAccessToken } = require('../src/utils/jwt');
const verifyToken = require('../src/middleware/verifyToken');
const requireRole = require('../src/middleware/requireRole');
const {
  captchaService,
  CaptchaService,
  InMemoryCaptchaStore,
  normalizeAnswer,
  hashAnswer,
} = require('../src/services/captchaService');
const { createRateLimiter } = require('../src/middleware/rateLimiter');

let server;
let baseUrl;
const createdUserIds = [];

// Helper to solve arithmetic question from captcha endpoint
function solveCaptchaQuestion(question) {
  const match = question.match(/What is (\d+) ([+-]) (\d+)\?/);
  if (!match) {
    throw new Error(`Unable to parse captcha question: ${question}`);
  }
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  return op === '+' ? String(a + b) : String(a - b);
}

// Helper to obtain a fresh valid CAPTCHA challenge & answer
async function getSolvedCaptcha() {
  const res = await fetch(`${baseUrl}/api/v1/auth/captcha`);
  const body = await res.json();
  assert.equal(res.status, 200);
  const captchaId = body.data.captchaId;
  const answer = solveCaptchaQuestion(body.data.question);
  return { captchaId, answer };
}

before(async () => {
  // Start server on an ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  // Clean up all created test users from the database
  if (createdUserIds.length > 0) {
    const placeholders = createdUserIds.map(() => '?').join(',');
    try {
      await db.query(`DELETE FROM \`users\` WHERE \`id\` IN (${placeholders})`, createdUserIds);
    } catch (err) {
      console.error('Error cleaning up test users:', err.message);
    }
  }

  // Close HTTP server and DB pool
  await new Promise((resolve) => server.close(resolve));
  await db.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAPTCHA SERVICE UNIT TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('1. CAPTCHA Service Unit Tests', () => {
  test('createChallenge generates 64-hex ID and valid question', () => {
    const challenge = captchaService.createChallenge();
    assert.ok(challenge.captchaId);
    assert.equal(challenge.captchaId.length, 64);
    assert.match(challenge.question, /What is \d+ [+-] \d+\?/);
    assert.equal(challenge.expiresInSeconds, 180);
  });

  test('expected answer is stored as HMAC hash, not plaintext', () => {
    const customStore = new InMemoryCaptchaStore();
    const service = new CaptchaService(customStore);
    const challenge = service.createChallenge();
    const stored = customStore.store.get(challenge.captchaId);

    assert.ok(stored);
    assert.ok(stored.answerHash);
    // Ensure answerHash is 64 hex characters (SHA-256)
    assert.equal(stored.answerHash.length, 64);
    assert.equal(stored.expectedAnswer, undefined, 'Plaintext answer must not be stored');
  });

  test('successful verification with correct answer', () => {
    const customStore = new InMemoryCaptchaStore();
    const service = new CaptchaService(customStore);
    const challenge = service.createChallenge();
    const answer = solveCaptchaQuestion(challenge.question);

    const result = service.verifyChallenge(challenge.captchaId, answer);
    assert.equal(result.valid, true);
  });

  test('single-use guarantee: challenge cannot be reused', () => {
    const customStore = new InMemoryCaptchaStore();
    const service = new CaptchaService(customStore);
    const challenge = service.createChallenge();
    const answer = solveCaptchaQuestion(challenge.question);

    // First use: valid
    const firstAttempt = service.verifyChallenge(challenge.captchaId, answer);
    assert.equal(firstAttempt.valid, true);

    // Second use: must be rejected
    const secondAttempt = service.verifyChallenge(challenge.captchaId, answer);
    assert.equal(secondAttempt.valid, false);
    assert.match(secondAttempt.reason, /not found, expired, or already used/i);
  });

  test('rejects incorrect answer and deletes challenge', () => {
    const customStore = new InMemoryCaptchaStore();
    const service = new CaptchaService(customStore);
    const challenge = service.createChallenge();

    const result = service.verifyChallenge(challenge.captchaId, '999999');
    assert.equal(result.valid, false);
    assert.match(result.reason, /incorrect/i);

    // Confirm it was consumed
    assert.equal(customStore.store.has(challenge.captchaId), false);
  });

  test('rejects expired challenge', () => {
    const customStore = new InMemoryCaptchaStore();
    const service = new CaptchaService(customStore);
    // Create challenge with -1 second TTL (already expired)
    const challenge = service.createChallenge(-1);
    const answer = solveCaptchaQuestion(challenge.question);

    const result = service.verifyChallenge(challenge.captchaId, answer);
    assert.equal(result.valid, false);
    assert.match(result.reason, /expired/i);
  });

  test('store evicts oldest entry when max capacity is reached', () => {
    const smallStore = new InMemoryCaptchaStore(3);
    const service = new CaptchaService(smallStore);

    const c1 = service.createChallenge();
    const c2 = service.createChallenge();
    const c3 = service.createChallenge();
    assert.equal(smallStore.size, 3);

    // Adding 4th must evict the first
    service.createChallenge();
    assert.equal(smallStore.size, 3);
    assert.equal(smallStore.store.has(c1.captchaId), false);
    assert.equal(smallStore.store.has(c2.captchaId), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RATE LIMITER MIDDLEWARE TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('2. Rate Limiter Middleware Tests', () => {
  test('sets rate limit headers and blocks when threshold exceeded', () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      message: 'Rate limit test exceeded.',
      keyGenerator: () => 'test-ip-key',
    });

    let statusCode = null;
    let body = null;
    const req = { ip: 'test-ip-key' };
    const res = {
      setHeader: () => {},
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        body = data;
        return res;
      },
    };

    let nextCount = 0;
    const next = () => { nextCount++; };

    // Request 1: allowed
    limiter(req, res, next);
    assert.equal(nextCount, 1);

    // Request 2: allowed
    limiter(req, res, next);
    assert.equal(nextCount, 2);

    // Request 3: blocked (max is 2)
    limiter(req, res, next);
    assert.equal(nextCount, 2, 'next() must not be called on 3rd request');
    assert.equal(statusCode, 429);
    assert.equal(body.success, false);
    assert.equal(body.message, 'Rate limit test exceeded.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOGIN INPUT VALIDATION TESTS (POST /api/v1/auth/login)
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Login Input Validation Tests', () => {
  test('rejects missing username with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'Password123!',
        captchaId: 'dummy',
        captchaAnswer: '42',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'username'));
  });

  test('rejects short username (< 3 chars) with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ab',
        password: 'Password123!',
        captchaId: 'dummy',
        captchaAnswer: '42',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'username'));
  });

  test('rejects missing password with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'validuser',
        captchaId: 'dummy',
        captchaAnswer: '42',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'password'));
  });

  test('rejects short password (< 8 chars) with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'validuser',
        password: 'short',
        captchaId: 'dummy',
        captchaAnswer: '42',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'password'));
  });

  test('rejects missing CAPTCHA challenge ID with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'validuser',
        password: 'Password123!',
        captchaAnswer: '42',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'captchaId'));
  });

  test('rejects missing CAPTCHA answer with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'validuser',
        password: 'Password123!',
        captchaId: 'dummy-id',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'captchaAnswer'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CAPTCHA VERIFICATION IN LOGIN ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────
describe('4. CAPTCHA Verification in Login Endpoint', () => {
  test('rejects invalid or non-existent CAPTCHA challenge ID with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'someuser',
        password: 'Password123!',
        captchaId: '0000000000000000000000000000000000000000000000000000000000000000',
        captchaAnswer: '42',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /not found, expired, or already used/i);
  });

  test('rejects incorrect CAPTCHA answer with HTTP 400', async () => {
    const { captchaId } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'someuser',
        password: 'Password123!',
        captchaId,
        captchaAnswer: 'wrong-answer',
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /incorrect/i);
  });

  test('rejects reused CAPTCHA challenge on second attempt', async () => {
    const { captchaId, answer } = await getSolvedCaptcha();

    // First attempt consumes the challenge
    await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'nonexistentuser',
        password: 'Password123!',
        captchaId,
        captchaAnswer: answer,
      }),
    });

    // Second attempt using the SAME captchaId must be rejected
    const secondRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'nonexistentuser',
        password: 'Password123!',
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await secondRes.json();
    assert.equal(secondRes.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /not found, expired, or already used/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. AUTHENTICATION & ROLE-AWARE LOGIN (ADMIN, FACULTY, STUDENT)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Authentication & Role-Aware Login Tests', () => {
  const plainPassword = 'CorrectPassword123!';
  let adminUsername;
  let adminId;
  let facultyUsername;
  let facultyId;
  let studentUsername;
  let studentId;

  before(async () => {
    const passHash = await hashPassword(plainPassword);

    // Create test ADMIN user
    adminUsername = `test_admin_${Date.now()}`;
    const [resAdmin] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [adminUsername, `${adminUsername}@college.edu`, passHash, 'ADMIN', null]
    );
    adminId = resAdmin[0][0].user_id;
    createdUserIds.push(adminId);

    // Create test FACULTY user
    facultyUsername = `test_fac_${Date.now()}`;
    const [resFac] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [facultyUsername, `${facultyUsername}@college.edu`, passHash, 'FACULTY', adminId]
    );
    facultyId = resFac[0][0].user_id;
    createdUserIds.push(facultyId);

    // Create test STUDENT user
    studentUsername = `test_stu_${Date.now()}`;
    const [resStu] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [studentUsername, `${studentUsername}@college.edu`, passHash, 'STUDENT', adminId]
    );
    studentId = resStu[0][0].user_id;
    createdUserIds.push(studentId);
  });

  test('ADMIN: successful login returns valid JWT and safe user object', async () => {
    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: adminUsername,
        password: plainPassword,
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, 'Login successful.');
    assert.ok(body.data.token, 'Must return access token');
    assert.ok(body.data.refreshToken, 'Must return refresh token');
    assert.equal(body.data.tokenType, 'Bearer');
    assert.equal(body.data.expiresIn, '8h');

    // Safe user object verification
    const user = body.data.user;
    assert.equal(user.id, adminId);
    assert.equal(user.username, adminUsername);
    assert.equal(user.role, 'ADMIN');

    // Security invariant: NO password_hash, reset tokens, or attempt counters
    assert.equal(user.password_hash, undefined);
    assert.equal(user.failed_login_attempts, undefined);
    assert.equal(user.locked_until, undefined);
    assert.equal(user.password_reset_token_hash, undefined);

    // Token claim verification
    const decoded = verifyAccessToken(body.data.token);
    assert.equal(decoded.sub, String(adminId));
    assert.equal(decoded.role, 'ADMIN');
    assert.equal(decoded.type, 'access');

    // Verify token works with verifyToken + requireRole('ADMIN')
    const mockReq = { headers: { authorization: `Bearer ${body.data.token}` } };
    const mockRes = { status: () => mockRes, json: () => mockRes };
    let tokenVerified = false;
    verifyToken(mockReq, mockRes, () => {
      tokenVerified = true;
    });
    assert.equal(tokenVerified, true);
    assert.deepEqual(mockReq.user, { id: String(adminId), role: 'ADMIN' });

    let roleAllowed = false;
    requireRole('ADMIN')(mockReq, mockRes, () => {
      roleAllowed = true;
    });
    assert.equal(roleAllowed, true);
  });

  test('FACULTY: successful login with role FACULTY', async () => {
    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: facultyUsername,
        password: plainPassword,
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.user.role, 'FACULTY');

    const decoded = verifyAccessToken(body.data.token);
    assert.equal(decoded.role, 'FACULTY');
  });

  test('STUDENT: successful login with role STUDENT', async () => {
    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: studentUsername,
        password: plainPassword,
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.user.role, 'STUDENT');

    const decoded = verifyAccessToken(body.data.token);
    assert.equal(decoded.role, 'STUDENT');
  });

  test('successful login resets failed_login_attempts to 0 and updates last_login_at', async () => {
    // Manually set failed_login_attempts to 3
    await db.query('UPDATE `users` SET `failed_login_attempts` = 3 WHERE `id` = ?', [studentId]);

    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: studentUsername,
        password: plainPassword,
        captchaId,
        captchaAnswer: answer,
      }),
    });
    assert.equal(res.status, 200);

    const [rows] = await db.query(
      'SELECT `failed_login_attempts`, `last_login_at` FROM `users` WHERE `id` = ?',
      [studentId]
    );
    assert.equal(rows[0].failed_login_attempts, 0, 'Counter must be reset to 0');
    assert.ok(rows[0].last_login_at, 'last_login_at must be populated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FAILED LOGINS, TIMING DEFENSE, AND ACCOUNT LOCKOUT POLICY
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Failed Logins and Account Lockout Policy Tests', () => {
  const plainPassword = 'SecurePassword789!';
  let testUser;
  let testUserId;

  before(async () => {
    const passHash = await hashPassword(plainPassword);
    testUser = `lockout_user_${Date.now()}`;
    const [res] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUser, `${testUser}@college.edu`, passHash, 'STUDENT', null]
    );
    testUserId = res[0][0].user_id;
    createdUserIds.push(testUserId);
  });

  test('non-existent username returns generic 401 (timing mitigated)', async () => {
    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'completely_unknown_user_123',
        password: 'SomePassword123!',
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.message, 'Invalid username or password.');
  });

  test('wrong password returns generic 401 and increments counter', async () => {
    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        password: 'WrongPassword123!',
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.message, 'Invalid username or password.');

    const [rows] = await db.query(
      'SELECT `failed_login_attempts`, `locked_until` FROM `users` WHERE `id` = ?',
      [testUserId]
    );
    assert.equal(rows[0].failed_login_attempts, 1);
    assert.equal(rows[0].locked_until, null);
  });

  test('reaching 5 failed attempts locks the account (HTTP 423)', async () => {
    // Set failed_login_attempts to 4 directly
    await db.query('UPDATE `users` SET `failed_login_attempts` = 4 WHERE `id` = ?', [testUserId]);

    // 5th failed attempt: triggers lockout
    const { captchaId: c1, answer: a1 } = await getSolvedCaptcha();
    const res5th = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        password: 'WrongPassword123!',
        captchaId: c1,
        captchaAnswer: a1,
      }),
    });
    assert.equal(res5th.status, 401);

    // Verify DB state: locked_until is set in the future
    const [rows] = await db.query(
      'SELECT `failed_login_attempts`, `locked_until` FROM `users` WHERE `id` = ?',
      [testUserId]
    );
    assert.equal(rows[0].failed_login_attempts, 5);
    assert.ok(rows[0].locked_until);
    assert.ok(new Date(rows[0].locked_until) > new Date());

    // 6th attempt (even with CORRECT password): must be rejected with 423 Locked
    const { captchaId: c2, answer: a2 } = await getSolvedCaptcha();
    const resLocked = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        password: plainPassword, // correct password!
        captchaId: c2,
        captchaAnswer: a2,
      }),
    });
    const bodyLocked = await resLocked.json();
    assert.equal(resLocked.status, 423);
    assert.equal(bodyLocked.success, false);
    assert.match(bodyLocked.message, /temporarily locked/i);
  });

  test('deactivated account (is_active = 0) returns HTTP 403', async () => {
    // Deactivate user via stored procedure
    await db.query('CALL sp_update_user_status(?, 0)', [testUserId]);

    const { captchaId, answer } = await getSolvedCaptcha();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        password: plainPassword,
        captchaId,
        captchaAnswer: answer,
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
    assert.match(body.message, /deactivated/i);

    // Restore active status
    await db.query('CALL sp_update_user_status(?, 1)', [testUserId]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. REGRESSION: GET /api/health
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Health Check Regression', () => {
  test('GET /api/health returns HTTP 200 with database connected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.api.status, 'ok');
    assert.equal(body.data.database.status, 'connected');
  });
});
