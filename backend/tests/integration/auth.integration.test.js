/**
 * backend/tests/integration/auth.integration.test.js
 *
 * Supertest integration tests for all authentication endpoints:
 * - GET /api/health
 * - GET /api/v1/auth/captcha
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/refresh (and /refresh-token alias)
 * - POST /api/v1/auth/logout
 * - POST /api/v1/auth/forgot-password
 * - POST /api/v1/auth/reset-password
 */

'use strict';

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { authService } = require('../../src/services/authService');
const {
  solveCaptchaQuestion,
  createTestUser,
  loginUser,
  cleanupTestUsers,
} = require('./testHelper');

describe('Integration: Authentication Routes', () => {
  const createdUserIds = [];

  afterAll(async () => {
    await cleanupTestUsers(createdUserIds);
  });

  describe('GET /api/health', () => {
    it('should return 200 with api ok and database connected', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.api.status).toBe('ok');
      expect(res.body.data.database.status).toBe('connected');
    });
  });

  describe('GET /api/v1/auth/captcha', () => {
    it('should return a new CAPTCHA challenge with question and captchaId', async () => {
      const res = await request(app).get('/api/v1/auth/captcha');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.captchaId).toBeDefined();
      expect(res.body.data.question).toMatch(/What is \d+ [+-] \d+\?/);
      expect(res.body.data.expiresInSeconds).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser;

    beforeAll(async () => {
      testUser = await createTestUser('FACULTY', 'Password123!');
      createdUserIds.push(testUser.id);
    });

    it('should reject login when required fields are missing with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeInstanceOf(Array);
    });

    it('should reject login when CAPTCHA is invalid with HTTP 400', async () => {
      const capRes = await request(app).get('/api/v1/auth/captcha');
      const captchaId = capRes.body.data.captchaId;

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
          captchaId,
          captchaAnswer: '999999', // wrong answer
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/captcha/i);
    });

    it('should reject login with wrong password with HTTP 401', async () => {
      const capRes = await request(app).get('/api/v1/auth/captcha');
      const captchaId = capRes.body.data.captchaId;
      const answer = solveCaptchaQuestion(capRes.body.data.question);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: testUser.username,
          password: 'IncorrectPassword999!',
          captchaId,
          captchaAnswer: answer,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid username or password.');
    });

    it('should successfully log in with valid credentials and return JWT tokens', async () => {
      const login = await loginUser(app, testUser.username, testUser.password);

      expect(login.status).toBe(200);
      expect(login.body.success).toBe(true);
      expect(login.token).toBeDefined();
      expect(login.refreshToken).toBeDefined();
      expect(Number(login.user.id)).toBe(Number(testUser.id));
      expect(login.user.role).toBe('FACULTY');
      expect(login.user.password_hash).toBeUndefined();
    });

    it('should reject login for deactivated account with HTTP 403', async () => {
      const deactivated = await createTestUser('STUDENT', 'Password123!');
      createdUserIds.push(deactivated.id);
      await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [deactivated.id]);

      const login = await loginUser(app, deactivated.username, deactivated.password);

      expect(login.status).toBe(403);
      expect(login.body.success).toBe(false);
      expect(login.body.message).toMatch(/deactivated/i);
    });
  });

  describe('POST /api/v1/auth/refresh & /refresh-token', () => {
    let session;
    let testUser;

    beforeAll(async () => {
      testUser = await createTestUser('STUDENT', 'Password123!');
      createdUserIds.push(testUser.id);
    });

    beforeEach(async () => {
      session = await loginUser(app, testUser.username, testUser.password);
    });

    it('should reject refresh without refreshToken with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should rotate token successfully and return new tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(session.refreshToken);
    });

    it('should reject reuse of already-rotated refresh token (replay protection) with HTTP 401', async () => {
      const firstRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(firstRefresh.status).toBe(200);

      // Attempt to reuse old token
      const secondRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken });

      expect(secondRefresh.status).toBe(401);
      expect(secondRefresh.body.success).toBe(false);
      expect(secondRefresh.body.message).toMatch(/revoked/i);
    });

    it('should support /refresh-token alias route identically', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken: session.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should revoke the refresh token and succeed idempotently', async () => {
      const user = await createTestUser('FACULTY', 'Password123!');
      createdUserIds.push(user.id);
      const session = await loginUser(app, user.username, user.password);

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: session.refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Attempting to refresh using revoked token must fail with 401
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/forgot-password & /reset-password', () => {
    let testUser;

    beforeAll(async () => {
      testUser = await createTestUser('STUDENT', 'OldPassword123!');
      createdUserIds.push(testUser.id);
    });

    it('should return identical generic message for existing and non-existing accounts', async () => {
      const resExisting = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email });

      const resNonExistent = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent999999@college.edu' });

      expect(resExisting.status).toBe(200);
      expect(resNonExistent.status).toBe(200);
      expect(resExisting.body.message).toBe(resNonExistent.body.message);
      expect(resExisting.body.data).toBeNull();
    });

    it('should complete reset-password flow and allow login with new password', async () => {
      // Trigger forgot password
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ username: testUser.username });

      // In test environment, authService provides the dev token
      const devToken = authService.getDevResetToken(testUser.username);
      expect(devToken).toBeDefined();

      const newPassword = 'BrandNewPassword1234!';
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: devToken,
          newPassword,
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Verify old password fails
      const oldLogin = await loginUser(app, testUser.username, testUser.password);
      expect(oldLogin.status).toBe(401);

      // Verify new password succeeds
      const newLogin = await loginUser(app, testUser.username, newPassword);
      expect(newLogin.status).toBe(200);
      expect(newLogin.token).toBeDefined();
    });
  });
});
