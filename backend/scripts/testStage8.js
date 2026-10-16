/**
 * backend/scripts/testStage8.js
 *
 * Automated test suite for Stage 8 — Secure Logout & Refresh Token Lifecycle.
 *
 * Scenarios covered:
 *   1. Validation tests for POST /refresh and POST /logout (missing/empty/malformed input)
 *   2. Token type & integrity tests (access token rejected as refresh token, tampered signature)
 *   3. Expired & unrecognized token rejection
 *   4. Successful atomic refresh token rotation (issues replacement tokens, links rotation chain)
 *   5. Replay attack rejection (old rotated token rejected with 401)
 *   6. Concurrent refresh attempts (atomic row locking ensures at most one succeeds)
 *   7. Logout and repeated logout (idempotent revocation)
 *   8. Post-logout refresh rejection
 *   9. Inactive user handling during refresh (HTTP 403)
 *  10. Deleted user handling during refresh (HTTP 401)
 *  11. Security invariants: zero internal field leakage in refresh responses
 *  12. Health check regression (GET /api/health)
 *  13. Safe database cleanup
 *
 * Uses Node.js built-in test runner (node:test).
 *
 * Run with:
 *   npm run test:stage8
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-stage8-suite-minimum-32-chars-ok';
process.env.BCRYPT_ROUNDS = '10';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = require('../src/utils/jwt');

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

// Helper to log in a user and obtain tokens
async function loginTestUser(username, password) {
  const capRes = await fetch(`${baseUrl}/api/v1/auth/captcha`);
  const capBody = await capRes.json();
  const answer = solveCaptchaQuestion(capBody.data.question);

  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      captchaId: capBody.data.captchaId,
      captchaAnswer: answer,
    }),
  });

  const loginBody = await loginRes.json();
  assert.equal(loginRes.status, 200);
  return loginBody.data;
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (createdUserIds.length > 0) {
    const placeholders = createdUserIds.map(() => '?').join(',');
    try {
      await db.query(`DELETE FROM \`users\` WHERE \`id\` IN (${placeholders})`, createdUserIds);
    } catch (err) {
      console.error('Error cleaning up test users:', err.message);
    }
  }

  await new Promise((resolve) => server.close(resolve));
  await db.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT VALIDATION TESTS (POST /refresh and POST /logout)
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Input Validation for /refresh and /logout', () => {
  test('POST /refresh rejects missing refreshToken with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'refreshToken'));
  });

  test('POST /refresh rejects empty string refreshToken with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: '   ' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });

  test('POST /logout rejects missing refreshToken with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'refreshToken'));
  });

  test('POST /logout rejects non-string refreshToken with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 12345 }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TOKEN TYPE & INTEGRITY VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
describe('2. Token Type & Integrity Validation', () => {
  test('POST /refresh rejects access token presented as refresh token with HTTP 401', async () => {
    // Generate valid access token (type: 'access')
    const accessToken = signAccessToken({ id: 999, role: 'STUDENT' });

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: accessToken }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /invalid/i);
  });

  test('POST /logout rejects access token presented as refresh token with HTTP 401', async () => {
    const accessToken = signAccessToken({ id: 999, role: 'ADMIN' });

    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: accessToken }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /invalid/i);
  });

  test('POST /refresh rejects malformed / tampered token with HTTP 401', async () => {
    const validRefresh = signRefreshToken({ id: 1 });
    const tampered = validRefresh.slice(0, -6) + 'XXXXXX';

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tampered }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /invalid/i);
  });

  test('POST /refresh rejects expired refresh token with HTTP 401', async () => {
    // Sign an expired refresh token
    const expiredToken = jwt.sign(
      { sub: '1', type: 'refresh' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 }
    );

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: expiredToken }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /expired/i);
  });

  test('POST /refresh rejects unrecognized token (valid JWT not in DB) with HTTP 401', async () => {
    // Valid JWT signature but not in refresh_tokens table
    const orphanedToken = signRefreshToken({ id: 999999 });

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: orphanedToken }),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /unrecognized|invalid/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUCCESSFUL TOKEN ROTATION & ROTATION CHAIN
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Successful Refresh Token Rotation Tests', () => {
  let testUsername;
  let testUserId;
  const password = 'RotationPassword123!';

  before(async () => {
    testUsername = `refresh_user_${Date.now()}`;
    const passHash = await hashPassword(password);
    const [res] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUsername, `${testUsername}@college.edu`, passHash, 'FACULTY', null]
    );
    testUserId = res[0][0].user_id;
    createdUserIds.push(testUserId);
  });

  test('rotates refresh token and issues replacement tokens', async () => {
    // 1. Log in user
    const loginData = await loginTestUser(testUsername, password);
    const initialRefresh = loginData.refreshToken;
    const initialHash = crypto.createHash('sha256').update(initialRefresh).digest('hex');

    // Confirm initial token is tracked in database
    const [initialRows] = await db.query(
      'SELECT is_revoked, expires_at FROM refresh_tokens WHERE token_hash = ?',
      [initialHash]
    );
    assert.equal(initialRows.length, 1);
    assert.equal(initialRows[0].is_revoked, 0);

    // 2. Perform rotation via POST /api/v1/auth/refresh
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: initialRefresh }),
    });
    const refreshBody = await refreshRes.json();

    assert.equal(refreshRes.status, 200);
    assert.equal(refreshBody.success, true);
    assert.equal(refreshBody.message, 'Tokens refreshed successfully.');
    assert.ok(refreshBody.data.token);
    assert.ok(refreshBody.data.refreshToken);
    assert.notEqual(refreshBody.data.refreshToken, initialRefresh, 'New refresh token must be distinct');

    // Verify replacement access token
    const decodedAccess = verifyAccessToken(refreshBody.data.token);
    assert.equal(decodedAccess.sub, String(testUserId));
    assert.equal(decodedAccess.role, 'FACULTY');

    // 3. Inspect database state for rotation chain
    const newHash = crypto.createHash('sha256').update(refreshBody.data.refreshToken).digest('hex');

    const [oldTokenCheck] = await db.query(
      'SELECT is_revoked, revoked_at, replaced_by_token_hash FROM refresh_tokens WHERE token_hash = ?',
      [initialHash]
    );
    assert.equal(oldTokenCheck[0].is_revoked, 1, 'Old token must be marked revoked');
    assert.ok(oldTokenCheck[0].revoked_at, 'Revocation timestamp must be set');
    assert.equal(oldTokenCheck[0].replaced_by_token_hash, newHash, 'Must link to replacement token hash');

    const [newTokenCheck] = await db.query(
      'SELECT is_revoked, user_id FROM refresh_tokens WHERE token_hash = ?',
      [newHash]
    );
    assert.equal(newTokenCheck.length, 1);
    assert.equal(newTokenCheck[0].is_revoked, 0, 'New token must be active');
    assert.equal(newTokenCheck[0].user_id, testUserId);
  });

  test('POST /refresh-token alias route works identically', async () => {
    const loginData = await loginTestUser(testUsername, password);

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.token);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. REPLAY ATTACK & OLD-TOKEN REJECTION
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Replay Attack & Old-Token Rejection Tests', () => {
  let testUsername;
  let testUserId;
  const password = 'ReplayPassword123!';

  before(async () => {
    testUsername = `replay_user_${Date.now()}`;
    const passHash = await hashPassword(password);
    const [res] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUsername, `${testUsername}@college.edu`, passHash, 'STUDENT', null]
    );
    testUserId = res[0][0].user_id;
    createdUserIds.push(testUserId);
  });

  test('reusing an old already-rotated refresh token fails with HTTP 401', async () => {
    const loginData = await loginTestUser(testUsername, password);
    const originalToken = loginData.refreshToken;

    // 1st rotation: succeeds
    const firstRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: originalToken }),
    });
    assert.equal(firstRes.status, 200);
    const firstBody = await firstRes.json();
    const replacementToken = firstBody.data.refreshToken;

    // 2nd attempt with originalToken: MUST BE REJECTED
    const replayRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: originalToken }),
    });
    const replayBody = await replayRes.json();
    assert.equal(replayRes.status, 401);
    assert.equal(replayBody.success, false);
    assert.match(replayBody.message, /revoked/i);

    // Verify replacement token was not affected and still works
    const validRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: replacementToken }),
    });
    assert.equal(validRes.status, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONCURRENT REFRESH ATTEMPTS (RACE CONDITION DEFENSE)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Concurrent Refresh Attempts Tests', () => {
  let testUsername;
  let testUserId;
  const password = 'ConcurrentPass123!';

  before(async () => {
    testUsername = `concurrent_user_${Date.now()}`;
    const passHash = await hashPassword(password);
    const [res] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUsername, `${testUsername}@college.edu`, passHash, 'ADMIN', null]
    );
    testUserId = res[0][0].user_id;
    createdUserIds.push(testUserId);
  });

  test('exactly ONE concurrent request succeeds; all others are rejected', async () => {
    const loginData = await loginTestUser(testUsername, password);
    const sharedToken = loginData.refreshToken;

    // Fire 5 concurrent refresh requests simultaneously with the same token
    const promises = Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: sharedToken }),
      }).then((r) => r.json().then((body) => ({ status: r.status, body })))
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.status === 200);
    const rejections = results.filter((r) => r.status === 401);

    assert.equal(successes.length, 1, 'Exactly one concurrent request must succeed');
    assert.equal(rejections.length, 4, 'All four other concurrent requests must fail with 401');
    rejections.forEach((r) => {
      assert.match(r.body.message, /revoked/i);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. LOGOUT AND REPEATED LOGOUT TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Logout and Repeated Logout Tests', () => {
  let testUsername;
  let testUserId;
  const password = 'LogoutPassword123!';

  before(async () => {
    testUsername = `logout_user_${Date.now()}`;
    const passHash = await hashPassword(password);
    const [res] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUsername, `${testUsername}@college.edu`, passHash, 'STUDENT', null]
    );
    testUserId = res[0][0].user_id;
    createdUserIds.push(testUserId);
  });

  test('POST /logout revokes the token and prevents further refresh', async () => {
    const loginData = await loginTestUser(testUsername, password);
    const token = loginData.refreshToken;

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    const logoutBody = await logoutRes.json();

    assert.equal(logoutRes.status, 200);
    assert.equal(logoutBody.success, true);
    assert.match(logoutBody.message, /logout successful/i);

    // Verify token is revoked in database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [dbCheck] = await db.query(
      'SELECT is_revoked, revoked_at FROM refresh_tokens WHERE token_hash = ?',
      [tokenHash]
    );
    assert.equal(dbCheck[0].is_revoked, 1);
    assert.ok(dbCheck[0].revoked_at);

    // Attempting to refresh with the revoked token must fail
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    const refreshBody = await refreshRes.json();
    assert.equal(refreshRes.status, 401);
    assert.match(refreshBody.message, /revoked/i);
  });

  test('repeated logout with the same token is idempotent and succeeds safely', async () => {
    const loginData = await loginTestUser(testUsername, password);
    const token = loginData.refreshToken;

    // First logout
    const res1 = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    assert.equal(res1.status, 200);

    // Second logout (same token)
    const res2 = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    });
    const body2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(body2.success, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. INACTIVE AND DELETED USER HANDLING
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Inactive and Deleted User Handling', () => {
  let inactiveUser;
  let inactiveUserId;
  let deletedUser;
  let deletedUserId;
  const password = 'StatusPassword123!';

  before(async () => {
    const passHash = await hashPassword(password);

    // Inactive user
    inactiveUser = `inactive_ref_${Date.now()}`;
    const [resInact] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [inactiveUser, `${inactiveUser}@college.edu`, passHash, 'STUDENT', null]
    );
    inactiveUserId = resInact[0][0].user_id;
    createdUserIds.push(inactiveUserId);

    // User to be deleted
    deletedUser = `deleted_ref_${Date.now()}`;
    const [resDel] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [deletedUser, `${deletedUser}@college.edu`, passHash, 'STUDENT', null]
    );
    deletedUserId = resDel[0][0].user_id;
    createdUserIds.push(deletedUserId);
  });

  test('deactivated account rejects refresh with HTTP 403', async () => {
    // 1. Log in while active
    const loginData = await loginTestUser(inactiveUser, password);

    // 2. Deactivate user account
    await db.query('CALL sp_update_user_status(?, 0)', [inactiveUserId]);

    // 3. Attempt refresh
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.equal(body.success, false);
    assert.match(body.message, /deactivated/i);

    // Restore active status
    await db.query('CALL sp_update_user_status(?, 1)', [inactiveUserId]);
  });

  test('deleted account rejects refresh with HTTP 401', async () => {
    // 1. Log in while user exists
    const loginData = await loginTestUser(deletedUser, password);

    // 2. Delete user from database (cascades or delete directly)
    await db.query('DELETE FROM users WHERE id = ?', [deletedUserId]);
    // Remove from createdUserIds since already deleted
    const idx = createdUserIds.indexOf(deletedUserId);
    if (idx !== -1) createdUserIds.splice(idx, 1);

    // 3. Attempt refresh
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /unrecognized|no longer exists|invalid/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SECURITY INVARIANTS: NO INTERNAL FIELD LEAKAGE
// ─────────────────────────────────────────────────────────────────────────────
describe('8. Security Invariants: No Sensitive Leakage in /refresh', () => {
  let testUser;
  const password = 'SecurityCheck123!';

  before(async () => {
    testUser = `security_user_${Date.now()}`;
    const passHash = await hashPassword(password);
    const [res] = await db.query(
      'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
      [testUser, `${testUser}@college.edu`, passHash, 'ADMIN', null]
    );
    createdUserIds.push(res[0][0].user_id);
  });

  test('refresh response strictly excludes password_hash, token_hash, and attempt counters', async () => {
    const loginData = await loginTestUser(testUser, password);

    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    const user = body.data.user;

    assert.equal(user.password_hash, undefined);
    assert.equal(user.failed_login_attempts, undefined);
    assert.equal(user.locked_until, undefined);
    assert.equal(user.password_reset_token_hash, undefined);
    assert.equal(body.data.token_hash, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. HEALTH CHECK REGRESSION
// ─────────────────────────────────────────────────────────────────────────────
describe('9. Health Check Regression', () => {
  test('GET /api/health returns HTTP 200 with database connected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.api.status, 'ok');
    assert.equal(body.data.database.status, 'connected');
  });
});
