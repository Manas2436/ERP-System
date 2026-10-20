/**
 * backend/tests/integration/e2eFlow.integration.test.js
 *
 * Automated end-to-end integration test exercising the full lifecycle:
 * CAPTCHA generation -> Solving -> Login -> Dashboard API access ->
 * Silent Token Rotation -> Retrying API -> Logout -> Revocation Verification.
 */

'use strict';

const request = require('supertest');
const app = require('../../src/app');
const {
  solveCaptchaQuestion,
  createTestUser,
  cleanupTestUsers,
} = require('./testHelper');

describe('Integration: End-to-End User Lifecycle Flow (Login -> Dashboard -> Refresh -> Logout)', () => {
  const createdUserIds = [];
  let testUser;

  beforeAll(async () => {
    testUser = await createTestUser('ADMIN', 'E2ePassword123!');
    createdUserIds.push(testUser.id);
  });

  afterAll(async () => {
    await cleanupTestUsers(createdUserIds);
  });

  it('should successfully execute the complete authentication lifecycle from login to logout', async () => {
    // ── STEP 1: Client requests CAPTCHA challenge ────────────────────────────
    const capRes = await request(app).get('/api/v1/auth/captcha');
    expect(capRes.status).toBe(200);
    expect(capRes.body.success).toBe(true);
    const { captchaId, question } = capRes.body.data;
    expect(captchaId).toBeDefined();
    expect(question).toBeDefined();

    // ── STEP 2: Client solves challenge and submits login credentials ─────────
    const answer = solveCaptchaQuestion(question);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: testUser.username,
        password: testUser.password,
        captchaId,
        captchaAnswer: answer,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    const { token: accessToken1, refreshToken: refreshToken1, user } = loginRes.body.data;
    expect(accessToken1).toBeDefined();
    expect(refreshToken1).toBeDefined();
    expect(user.role).toBe('ADMIN');

    // ── STEP 3: Client accesses role-protected dashboard endpoint ─────────────
    const dashboardRes1 = await request(app)
      .get('/api/v1/admin/users?page=1&pageSize=5')
      .set('Authorization', `Bearer ${accessToken1}`);

    expect(dashboardRes1.status).toBe(200);
    expect(dashboardRes1.body.success).toBe(true);
    expect(dashboardRes1.body.data.pagination).toBeDefined();
    expect(dashboardRes1.body.data.users).toBeInstanceOf(Array);

    // ── STEP 4: Client initiates silent background token rotation ─────────────
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshToken1 });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    const { token: accessToken2, refreshToken: refreshToken2 } = refreshRes.body.data;
    expect(accessToken2).toBeDefined();
    expect(refreshToken2).toBeDefined();
    expect(refreshToken2).not.toBe(refreshToken1);

    // ── STEP 5: Replay attack prevention: old refresh token must be rejected ───
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshToken1 });

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.success).toBe(false);

    // ── STEP 6: Client accesses protected dashboard using new access token ────
    const dashboardRes2 = await request(app)
      .get('/api/v1/admin/users?page=1&pageSize=5')
      .set('Authorization', `Bearer ${accessToken2}`);

    expect(dashboardRes2.status).toBe(200);
    expect(dashboardRes2.body.success).toBe(true);

    // ── STEP 7: Client securely logs out and terminates session ───────────────
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: refreshToken2 });

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // ── STEP 8: Post-logout verification: revoked token cannot be refreshed ────
    const postLogoutRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshToken2 });

    expect(postLogoutRefresh.status).toBe(401);
    expect(postLogoutRefresh.body.success).toBe(false);
  });
});
