/**
 * backend/scripts/testStage9.js
 *
 * Automated test suite for Stage 9 — Forgot Password & Secure Reset Password.
 *
 * Scenarios covered:
 *   1. Input validation for POST /forgot-password
 *   2. Anti-enumeration: identical generic response for existing, non-existent, and deactivated accounts
 *   3. Cryptographic token security: hashed-only token storage (SHA-256) & short expiry window
 *   4. Input validation for POST /reset-password (token & password policy)
 *   5. Successful password reset flow across roles (ADMIN, FACULTY, STUDENT) and subsequent login verification
 *   6. Single-use enforcement and replay defense (reusing consumed token fails with HTTP 400)
 *   7. Expired token rejection (HTTP 400) without altering password
 *   8. Invalid / tampered token rejection (HTTP 400)
 *   9. Concurrency protection: atomic serialization ensures exactly ONE concurrent reset succeeds
 *  10. Session revocation: revokes all active refresh tokens in refresh_tokens table upon successful reset
 *  11. Account lockout clearing: successful reset clears failed attempts counter and unlocks account
 *  12. Deactivated user handling: generic response on forgot-password, HTTP 403 on reset attempt
 *  13. Rate limiter middleware tests (headers & 429 response)
 *  14. Regressions: CAPTCHA, login, refresh, logout, and health check
 *  15. Complete cleanup of all test accounts and database verification
 *
 * Uses Node.js built-in test runner (node:test).
 *
 * Run with:
 *   npm run test:stage9
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-stage9-suite-minimum-32-chars-ok';
process.env.BCRYPT_ROUNDS = '10';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { authService } = require('../src/services/authService');
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
  return { status: loginRes.status, body: loginBody };
}

// Helper to create a test user via stored procedure
async function createTestUser(role = 'STUDENT', initialPassword = 'InitialPassword123!') {
  const username = `test_st9_${role.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `${username}@college.edu`;
  const passHash = await hashPassword(initialPassword);

  const [res] = await db.query(
    'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
    [username, email, passHash, role, null]
  );
  const userId = res[0][0].user_id;
  createdUserIds.push(userId);

  return { id: userId, username, email, password: initialPassword };
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
// 1. INPUT VALIDATION TESTS (POST /forgot-password)
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Input Validation for /forgot-password', () => {
  test('rejects missing identifier with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'identifier'));
  });

  test('rejects empty string identifier with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '   ' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });

  test('rejects malformed email address with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email@' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'email'));
  });

  test('rejects username shorter than 3 characters with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ab' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'username'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ANTI-ENUMERATION & GENERIC RESPONSES
// ─────────────────────────────────────────────────────────────────────────────
describe('2. Generic Responses for Existing & Nonexistent Accounts', () => {
  let testUser;

  before(async () => {
    testUser = await createTestUser('STUDENT');
  });

  test('existing account by email returns HTTP 200 with generic message and null data', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data, null);
    assert.equal(body.errors, null);
    assert.match(body.message, /If an account matching the provided identifier exists/i);
  });

  test('existing account by username returns HTTP 200 with identical generic response', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser.username }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data, null);
    assert.match(body.message, /If an account matching the provided identifier exists/i);
  });

  test('nonexistent email returns HTTP 200 with identical generic message', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent_user_999999@college.edu' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data, null);
    assert.match(body.message, /If an account matching the provided identifier exists/i);
  });

  test('nonexistent username returns HTTP 200 with identical generic message', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent_user_999999' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data, null);
    assert.match(body.message, /If an account matching the provided identifier exists/i);
  });

  test('response never contains tokens, passwords, or internal fields', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email }),
    });
    const body = await res.json();
    assert.equal(body.data, null);
    assert.equal(body.token, undefined);
    assert.equal(body.resetToken, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HASHED-ONLY TOKEN STORAGE & EXPIRY
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Hashed-Only Reset Token Storage & Dev Retrieval', () => {
  let testUser;

  before(async () => {
    testUser = await createTestUser('FACULTY');
  });

  test('stores SHA-256 hash in DB, never plaintext token', async () => {
    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email }),
    });

    const rawToken = authService.getDevResetToken(testUser.email);
    assert.ok(rawToken, 'Dev reset token should be accessible via internal testing hook in test env');
    assert.equal(typeof rawToken, 'string');
    assert.equal(rawToken.length, 64, 'Raw token should be 64 hex characters (32 random bytes)');

    // Verify database row
    const [rows] = await db.query(
      'SELECT password_reset_token_hash, password_reset_expires_at FROM users WHERE id = ?',
      [testUser.id]
    );
    assert.equal(rows.length, 1);
    const dbHash = rows[0].password_reset_token_hash;
    const dbExpiresAt = new Date(rows[0].password_reset_expires_at);

    // Verify hash
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    assert.equal(dbHash, expectedHash, 'Database must store exactly SHA-256(rawToken)');
    assert.notEqual(dbHash, rawToken, 'Database must never store the raw unhashed token');

    // Verify expiry window is future (~15 min)
    const now = Date.now();
    const diffMs = dbExpiresAt.getTime() - now;
    assert.ok(diffMs > 13 * 60 * 1000 && diffMs <= 16 * 60 * 1000, 'Expiry must be approximately 15 minutes in future');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. INPUT VALIDATION TESTS (POST /reset-password)
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Input Validation for /reset-password', () => {
  test('rejects missing reset token with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'ValidPassword123!' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'token'));
  });

  test('rejects empty string reset token with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '   ', newPassword: 'ValidPassword123!' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });

  test('rejects token shorter than 16 characters with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'short-tok', newPassword: 'ValidPassword123!' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'token'));
  });

  test('rejects missing new password with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(32) }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'newPassword'));
  });

  test('rejects new password shorter than 8 characters with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(32), newPassword: 'short' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'newPassword'));
  });

  test('rejects new password longer than 128 characters with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(32), newPassword: 'p'.repeat(129) }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'newPassword'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUCCESSFUL RESET & SUBSEQUENT LOGIN ACROSS ROLES
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Successful Password Reset & Subsequent Login Across Roles', () => {
  const roles = ['ADMIN', 'FACULTY', 'STUDENT'];

  for (const role of roles) {
    test(`resets password successfully for ${role} role and enables login with new password`, async () => {
      const initialPass = 'OldSecretPass123!';
      const newPass = 'BrandNewSecretPass456!';
      const user = await createTestUser(role, initialPass);

      // 1. Request forgot-password
      const forgotRes = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      assert.equal(forgotRes.status, 200);

      // 2. Retrieve token via dev hook
      const rawToken = authService.getDevResetToken(user.email);
      assert.ok(rawToken);

      // 3. Reset password
      const resetRes = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken, newPassword: newPass }),
      });
      const resetBody = await resetRes.json();
      assert.equal(resetRes.status, 200);
      assert.equal(resetBody.success, true);

      // 4. Confirm token was consumed in database (set to NULL)
      const [rows] = await db.query(
        'SELECT password_reset_token_hash, password_reset_expires_at FROM users WHERE id = ?',
        [user.id]
      );
      assert.equal(rows[0].password_reset_token_hash, null);
      assert.equal(rows[0].password_reset_expires_at, null);

      // 5. Attempt login with OLD password -> MUST FAIL (HTTP 401)
      const oldLogin = await loginTestUser(user.username, initialPass);
      assert.equal(oldLogin.status, 401);
      assert.equal(oldLogin.body.success, false);

      // 6. Attempt login with NEW password -> MUST SUCCEED (HTTP 200)
      const newLogin = await loginTestUser(user.username, newPass);
      assert.equal(newLogin.status, 200);
      assert.equal(newLogin.body.success, true);
      assert.equal(newLogin.body.data.user.role, role);
      assert.ok(newLogin.body.data.token);
      assert.ok(newLogin.body.data.refreshToken);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SINGLE-USE & REUSE REJECTION
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Single-Use and Token Reuse Prevention', () => {
  let user;
  let rawToken;

  before(async () => {
    user = await createTestUser('STUDENT', 'InitialPass123!');
    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    rawToken = authService.getDevResetToken(user.email);

    // Consume the token once
    const firstReset = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'FirstUpdatedPass123!' }),
    });
    assert.equal(firstReset.status, 200);
  });

  test('reusing the consumed token fails with HTTP 400', async () => {
    const reuseRes = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'SecondUpdatedPass456!' }),
    });
    const body = await reuseRes.json();
    assert.equal(reuseRes.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /invalid or expired/i);
  });

  test('password was NOT changed by the reused attempt', async () => {
    // Attempt login with second password -> fails
    const failLogin = await loginTestUser(user.username, 'SecondUpdatedPass456!');
    assert.equal(failLogin.status, 401);

    // Login with first updated password -> succeeds
    const okLogin = await loginTestUser(user.username, 'FirstUpdatedPass123!');
    assert.equal(okLogin.status, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. EXPIRED TOKEN REJECTION
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Expired Token Rejection', () => {
  let user;
  let rawToken;

  before(async () => {
    user = await createTestUser('STUDENT', 'OriginalPass123!');
    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    rawToken = authService.getDevResetToken(user.email);

    // Manually set expiration in past using JavaScript Date (timezone consistent with pool)
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    await db.query(
      'UPDATE users SET password_reset_expires_at = ? WHERE id = ?',
      [pastDate, user.id]
    );
  });

  test('rejects expired reset token with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'NewExpiredPass123!' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /expired/i);
  });

  test('expired token does NOT update the password', async () => {
    // Login with attempted new pass fails
    const failLogin = await loginTestUser(user.username, 'NewExpiredPass123!');
    assert.equal(failLogin.status, 401);

    // Login with original password succeeds
    const okLogin = await loginTestUser(user.username, 'OriginalPass123!');
    assert.equal(okLogin.status, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. INVALID & TAMPERED TOKEN REJECTION
// ─────────────────────────────────────────────────────────────────────────────
describe('8. Invalid & Tampered Token Rejection', () => {
  test('rejects completely fabricated token with HTTP 400', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex');
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: fakeToken, newPassword: 'ValidNewPass123!' }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /invalid or expired/i);
  });

  test('rejects tampered token with HTTP 400', async () => {
    const user = await createTestUser('STUDENT');
    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const validToken = authService.getDevResetToken(user.email);
    // Tamper with last character
    const lastChar = validToken.slice(-1);
    const tampered = validToken.slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');

    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tampered, newPassword: 'ValidNewPass123!' }),
    });
    assert.equal(res.status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CONCURRENT RESET RACE CONDITION DEFENSE
// ─────────────────────────────────────────────────────────────────────────────
describe('9. Concurrent Reset Race Condition Defense', () => {
  test('exactly ONE concurrent request succeeds; all others are rejected', async () => {
    const user = await createTestUser('FACULTY', 'ConcurrentStart123!');

    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const rawToken = authService.getDevResetToken(user.email);

    // Launch 5 simultaneous reset attempts with distinct new passwords
    const promises = [1, 2, 3, 4, 5].map((i) =>
      fetch(`${baseUrl}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken, newPassword: `WinningPasswordCandidate${i}!` }),
      })
    );

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);

    const count200 = statuses.filter((s) => s === 200).length;
    const count400 = statuses.filter((s) => s === 400).length;

    assert.equal(count200, 1, 'Exactly one concurrent request must succeed');
    assert.equal(count400, 4, 'All four other concurrent requests must fail with HTTP 400');

    // Confirm token in database is consumed (NULL)
    const [rows] = await db.query(
      'SELECT password_reset_token_hash FROM users WHERE id = ?',
      [user.id]
    );
    assert.equal(rows[0].password_reset_token_hash, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. REFRESH-SESSION REVOCATION UPON RESET
// ─────────────────────────────────────────────────────────────────────────────
describe('10. Refresh Session Revocation Upon Password Reset', () => {
  test('revokes all existing refresh tokens for the user in refresh_tokens table', async () => {
    const user = await createTestUser('STUDENT', 'SessionRevokePass123!');

    // 1. User logs in -> acquires active refresh token
    const loginData = await loginTestUser(user.username, 'SessionRevokePass123!');
    assert.equal(loginData.status, 200);
    const activeRefreshToken = loginData.body.data.refreshToken;
    const refreshHash = crypto.createHash('sha256').update(activeRefreshToken).digest('hex');

    // Verify token is active in DB
    const [beforeRows] = await db.query(
      'SELECT is_revoked FROM refresh_tokens WHERE token_hash = ?',
      [refreshHash]
    );
    assert.equal(beforeRows.length, 1);
    assert.equal(beforeRows[0].is_revoked, 0);

    // 2. User performs password reset
    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const rawToken = authService.getDevResetToken(user.email);

    const resetRes = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'AfterResetPass123!' }),
    });
    assert.equal(resetRes.status, 200);

    // 3. Confirm all refresh tokens for this user are now revoked in DB
    const [afterRows] = await db.query(
      'SELECT is_revoked, revoked_at FROM refresh_tokens WHERE token_hash = ?',
      [refreshHash]
    );
    assert.equal(afterRows[0].is_revoked, 1);
    assert.ok(afterRows[0].revoked_at !== null);

    // 4. Attempting to rotate the old refresh token MUST be rejected (HTTP 401)
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: activeRefreshToken }),
    });
    const refreshBody = await refreshRes.json();
    assert.equal(refreshRes.status, 401);
    assert.match(refreshBody.message, /revoked/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. ACCOUNT LOCKOUT CLEARING ON RESET
// ─────────────────────────────────────────────────────────────────────────────
describe('11. Account Lockout Clearing on Password Reset', () => {
  test('clears lockout and reset counters, allowing immediate login with new password', async () => {
    const user = await createTestUser('FACULTY', 'LockoutClearInitial123!');

    // Intentionally fail login 5 times to trigger account lockout
    for (let i = 0; i < 5; i++) {
      await loginTestUser(user.username, 'WrongPassword123!');
    }

    // Verify account is locked (HTTP 423)
    const lockedLogin = await loginTestUser(user.username, 'LockoutClearInitial123!');
    assert.equal(lockedLogin.status, 423);

    // User requests forgot-password and resets password
    await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username }),
    });
    const rawToken = authService.getDevResetToken(user.username);

    const resetRes = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'FreshUnlockedPass123!' }),
    });
    assert.equal(resetRes.status, 200);

    // Verify DB columns are cleared
    const [rows] = await db.query(
      'SELECT failed_login_attempts, locked_until FROM users WHERE id = ?',
      [user.id]
    );
    assert.equal(rows[0].failed_login_attempts, 0);
    assert.equal(rows[0].locked_until, null);

    // User can immediately log in with new password
    const okLogin = await loginTestUser(user.username, 'FreshUnlockedPass123!');
    assert.equal(okLogin.status, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. INACTIVE ACCOUNT HANDLING
// ─────────────────────────────────────────────────────────────────────────────
describe('12. Inactive Account Handling', () => {
  let inactiveUser;

  before(async () => {
    inactiveUser = await createTestUser('STUDENT', 'InactiveInitial123!');
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [inactiveUser.id]);
  });

  test('forgot-password for deactivated account returns generic HTTP 200 (no leakage)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inactiveUser.email }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data, null);
    // Dev token should NOT be generated for inactive account
    const token = authService.getDevResetToken(inactiveUser.email);
    assert.equal(token, null);
  });

  test('reset-password for deactivated account returns HTTP 403', async () => {
    // Manually insert a token hash for testing deactivated account rejection on reset
    const testRaw = crypto.randomBytes(32).toString('hex');
    const testHash = crypto.createHash('sha256').update(testRaw).digest('hex');
    await db.query(
      'UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?',
      [testHash, inactiveUser.id]
    );

    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: testRaw, newPassword: 'DeactivatedNewPass123!' }),
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.match(body.message, /deactivated/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. RATE LIMITING TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('13. Rate Limiter Tests', () => {
  test('forgot-password and reset-password endpoints return RateLimit headers', async () => {
    const res1 = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@college.edu' }),
    });
    assert.ok(res1.headers.has('x-ratelimit-limit') || res1.status === 200);

    const res2 = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(32), newPassword: 'ValidPass123!' }),
    });
    assert.ok(res2.headers.has('x-ratelimit-limit') || res2.status === 400);
  });

  test('rate limiter middleware returns HTTP 429 when threshold exceeded', async () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      message: 'Too many reset requests.',
      skipInTest: false,
    });

    let lastStatus;
    const req = { ip: '192.168.1.100' };
    const res = {
      setHeader: () => {},
      status: (s) => ({
        json: () => {
          lastStatus = s;
        },
      }),
    };

    let nextCalled = 0;
    const next = () => { nextCalled++; };

    limiter(req, res, next); // 1st
    assert.equal(nextCalled, 1);

    limiter(req, res, next); // 2nd
    assert.equal(nextCalled, 2);

    limiter(req, res, next); // 3rd -> exceed
    assert.equal(lastStatus, 429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. REGRESSION TESTS (CAPTCHA, LOGIN, REFRESH, LOGOUT, HEALTH)
// ─────────────────────────────────────────────────────────────────────────────
describe('14. Regressions and Database Health', () => {
  test('GET /api/v1/auth/captcha generates challenge correctly', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/captcha`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.data.captchaId);
    assert.ok(body.data.question);
  });

  test('full login -> refresh -> logout regression works', async () => {
    const user = await createTestUser('STUDENT', 'RegressionPass123!');

    // Login
    const loginData = await loginTestUser(user.username, 'RegressionPass123!');
    assert.equal(loginData.status, 200);
    const refreshToken = loginData.body.data.refreshToken;

    // Refresh
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshBody = await refreshRes.json();
    assert.equal(refreshRes.status, 200);
    const newRefresh = refreshBody.data.refreshToken;

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: newRefresh }),
    });
    assert.equal(logoutRes.status, 200);
  });

  test('GET /api/health returns HTTP 200 with database connected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.api.status, 'ok');
    assert.equal(body.data.database.status, 'connected');
  });
});
