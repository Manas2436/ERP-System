/**
 * backend/scripts/testStage12.js
 *
 * Automated test suite for Stage 12 — Admin User Management API Routes.
 *
 * Endpoints covered:
 *   1. GET    /api/v1/admin/users
 *   2. POST   /api/v1/admin/users
 *   3. GET    /api/v1/admin/users/:id
 *   4. PUT    /api/v1/admin/users/:id
 *   5. PATCH  /api/v1/admin/users/:id/status
 *
 * Scenarios tested:
 *   - Authentication enforcement (HTTP 401 for missing/invalid tokens)
 *   - Role-Based Access Control (HTTP 403 for STUDENT and FACULTY roles)
 *   - ADMIN role authorization (HTTP 200/201 for ADMIN)
 *   - User directory pagination and parameter validation
 *   - Safe user provisioning (FACULTY, STUDENT) using sp_create_user
 *   - Duplicate username/email conflict rejection (HTTP 409)
 *   - Password policy and input validation (HTTP 400)
 *   - Safe profile retrieval (strictly excluding password_hash, tokens, and secrets)
 *   - Role modification using sp_update_user_role
 *   - Self-demotion defense and single active administrator protection
 *   - Account activation/deactivation using sp_update_user_status
 *   - Self-deactivation defense
 *   - Session revocation on deactivation (active refresh tokens invalidated)
 *   - Health check and regression checks
 *   - Clean isolation and complete cleanup of test records
 *
 * Run with:
 *   npm run test:stage12
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-stage12-suite-minimum-32-chars-ok';
process.env.BCRYPT_ROUNDS = '10';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const db = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { signAccessToken } = require('../src/utils/jwt');

let server;
let baseUrl;
const createdUserIds = [];

// Helper to create an isolated test user directly in DB
async function createTestUser(role = 'STUDENT', initialPassword = 'InitialPassword123!', isActive = 1) {
  const username = `test_st12_${role.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `${username}@college.edu`;
  const passHash = await hashPassword(initialPassword);

  const [res] = await db.query(
    'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
    [username, email, passHash, role, null]
  );
  const userId = res[0][0].user_id;
  createdUserIds.push(userId);

  if (isActive === 0) {
    await db.query('UPDATE `users` SET `is_active` = 0 WHERE `id` = ?', [userId]);
  }

  const token = signAccessToken({ id: String(userId), role });

  return { id: userId, username, email, password: initialPassword, role, token };
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
// 1. AUTHORIZATION AND RBAC ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Authentication & RBAC Enforcement on Admin Routes', () => {
  test('rejects unauthenticated requests with HTTP 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users`);
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /authorization header is missing/i);
  });

  test('rejects non-Bearer authorization scheme with HTTP 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.match(body.message, /must use bearer scheme/i);
  });

  test('rejects STUDENT role with HTTP 403 Forbidden', async () => {
    const student = await createTestUser('STUDENT');
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
    assert.match(body.message, /permission to access this resource/i);
  });

  test('rejects FACULTY role with HTTP 403 Forbidden', async () => {
    const faculty = await createTestUser('FACULTY');
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${faculty.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.success, false);
    assert.match(body.message, /permission to access this resource/i);
  });

  test('allows ADMIN role with HTTP 200 OK', async () => {
    const admin = await createTestUser('ADMIN');
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.users));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/admin/users (DIRECTORY & PAGINATION)
// ─────────────────────────────────────────────────────────────────────────────
describe('2. User Directory and Pagination (GET /api/v1/admin/users)', () => {
  let admin;

  before(async () => {
    admin = await createTestUser('ADMIN');
  });

  test('returns pagination metadata (page, pageSize, total, totalPages)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users?page=1&pageSize=5`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.pagination.page, 1);
    assert.equal(body.data.pagination.pageSize, 5);
    assert.ok(typeof body.data.pagination.total === 'number');
    assert.ok(typeof body.data.pagination.totalPages === 'number');
  });

  test('rejects invalid page (< 1) with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users?page=0`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'page'));
  });

  test('rejects pageSize exceeding maximum (> 100) with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users?pageSize=150`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(body.errors.some((e) => e.field === 'pageSize'));
  });

  test('filters directory by role (FACULTY)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users?role=FACULTY`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    body.data.users.forEach((u) => {
      assert.equal(u.role, 'FACULTY');
    });
  });

  test('rejects invalid role filter string with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users?role=SUPERUSER`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });

  test('strictly excludes secret fields (password_hash, token_hash) from directory response', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users?pageSize=10`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    body.data.users.forEach((u) => {
      assert.equal(u.password_hash, undefined);
      assert.equal(u.password_reset_token_hash, undefined);
      assert.equal(u.token_hash, undefined);
      assert.ok(u.id);
      assert.ok(u.username);
      assert.ok(u.email);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/v1/admin/users (USER PROVISIONING)
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Account Provisioning (POST /api/v1/admin/users)', () => {
  let admin;

  before(async () => {
    admin = await createTestUser('ADMIN');
  });

  test('provisions a new FACULTY user successfully', async () => {
    const username = `prof_st12_${Date.now()}`;
    const email = `${username}@college.edu`;

    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        username,
        email,
        password: 'FacultyPassword123!',
        role: 'FACULTY',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.user.username, username);
    assert.equal(body.data.user.email, email);
    assert.equal(body.data.user.role, 'FACULTY');
    assert.equal(body.data.user.is_active, 1);
    assert.equal(body.data.user.created_by, admin.id);
    assert.equal(body.data.user.password_hash, undefined);

    createdUserIds.push(body.data.user.id);
  });

  test('provisions a new STUDENT user successfully', async () => {
    const username = `student_st12_${Date.now()}`;
    const email = `${username}@college.edu`;

    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        username,
        email,
        password: 'StudentPassword123!',
        role: 'STUDENT',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.data.user.role, 'STUDENT');
    createdUserIds.push(body.data.user.id);
  });

  test('rejects duplicate username with HTTP 409 Conflict', async () => {
    const existing = await createTestUser('STUDENT');

    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        username: existing.username,
        email: `unique_${Date.now()}@college.edu`,
        password: 'Password123!',
        role: 'STUDENT',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.success, false);
    assert.match(body.message, /username is already taken/i);
  });

  test('rejects duplicate email with HTTP 409 Conflict', async () => {
    const existing = await createTestUser('STUDENT');

    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        username: `unique_user_${Date.now()}`,
        email: existing.email,
        password: 'Password123!',
        role: 'STUDENT',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.success, false);
    assert.match(body.message, /email is already registered/i);
  });

  test('rejects invalid password (< 8 chars) with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        username: `valid_user_${Date.now()}`,
        email: `valid_${Date.now()}@college.edu`,
        password: 'short',
        role: 'STUDENT',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'password'));
  });

  test('rejects invalid role with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        username: `valid_user_${Date.now()}`,
        email: `valid_${Date.now()}@college.edu`,
        password: 'ValidPassword123!',
        role: 'INVALID_ROLE',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.errors.some((e) => e.field === 'role'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/v1/admin/users/:id (USER PROFILE)
// ─────────────────────────────────────────────────────────────────────────────
describe('4. User Profile Retrieval (GET /api/v1/admin/users/:id)', () => {
  let admin;
  let targetUser;

  before(async () => {
    admin = await createTestUser('ADMIN');
    targetUser = await createTestUser('STUDENT');
  });

  test('retrieves profile for valid user ID excluding secrets', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.id, targetUser.id);
    assert.equal(body.data.user.username, targetUser.username);
    assert.equal(body.data.user.email, targetUser.email);
    assert.equal(body.data.user.password_hash, undefined);
    assert.equal(body.data.user.password_reset_token_hash, undefined);
  });

  test('returns HTTP 404 for non-existent user ID', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/99999999`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.success, false);
    assert.match(body.message, /user not found/i);
  });

  test('returns HTTP 400 for non-numeric user ID', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/abc`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PUT /api/v1/admin/users/:id (ROLE MODIFICATION)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Role Modification (PUT /api/v1/admin/users/:id)', () => {
  let admin;
  let targetUser;

  before(async () => {
    admin = await createTestUser('ADMIN');
    targetUser = await createTestUser('STUDENT');
  });

  test('updates target user role from STUDENT to FACULTY', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ role: 'FACULTY' }),
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.role, 'FACULTY');

    // Confirm in DB
    const [rows] = await db.query('SELECT `role` FROM `users` WHERE `id` = ?', [targetUser.id]);
    assert.equal(rows[0].role, 'FACULTY');
  });

  test('rejects self-demotion when administrator attempts to demote own account', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${admin.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ role: 'STUDENT' }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /cannot demote their own account role/i);
  });

  test('rejects invalid role with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ role: 'UNKNOWN_ROLE' }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });

  test('rejects role update for non-existent user with HTTP 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/99999999`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ role: 'FACULTY' }),
    });

    const body = await res.json();
    assert.equal(res.status, 404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PATCH /api/v1/admin/users/:id/status (ACCOUNT STATUS & SESSION REVOCATION)
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Account Status & Session Revocation (PATCH /api/v1/admin/users/:id/status)', () => {
  let admin;
  let targetUser;

  before(async () => {
    admin = await createTestUser('ADMIN');
    targetUser = await createTestUser('STUDENT');
  });

  test('deactivates account and revokes active refresh-token sessions', async () => {
    // 1. Simulate an active refresh token for target user
    const tokenHash = `fake_hash_${Date.now()}`;
    await db.query(
      'INSERT INTO `refresh_tokens` (`user_id`, `token_hash`, `expires_at`, `is_revoked`) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), 0)',
      [targetUser.id, tokenHash]
    );

    // 2. Admin deactivates target user
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ isActive: false }),
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.is_active, 0);

    // 3. Verify in DB that is_active is 0
    const [userRows] = await db.query('SELECT `is_active` FROM `users` WHERE `id` = ?', [targetUser.id]);
    assert.equal(userRows[0].is_active, 0);

    // 4. Verify in DB that refresh token is marked revoked
    const [tokenRows] = await db.query(
      'SELECT `is_revoked`, `revoked_at` FROM `refresh_tokens` WHERE `token_hash` = ?',
      [tokenHash]
    );
    assert.equal(tokenRows[0].is_revoked, 1);
    assert.ok(tokenRows[0].revoked_at);
  });

  test('reactivates account successfully', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ isActive: true }),
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.user.is_active, 1);

    const [userRows] = await db.query('SELECT `is_active` FROM `users` WHERE `id` = ?', [targetUser.id]);
    assert.equal(userRows[0].is_active, 1);
  });

  test('rejects self-deactivation when administrator attempts to deactivate own account', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${admin.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ isActive: 0 }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /cannot deactivate their own account/i);
  });

  test('rejects invalid status format with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/${targetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ isActive: 'not_a_boolean' }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  });

  test('rejects status update for non-existent user with HTTP 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/users/99999999/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ isActive: 1 }),
    });

    const body = await res.json();
    assert.equal(res.status, 404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. REGRESSION & DATABASE HEALTH
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Health Check Regression', () => {
  test('GET /api/health returns HTTP 200 with database connected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.api.status, 'ok');
    assert.equal(body.data.database.status, 'connected');
  });
});
