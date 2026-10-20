/**
 * backend/tests/integration/admin.integration.test.js
 *
 * Supertest integration tests for administrative user management routes:
 * - GET /api/v1/admin/users
 * - POST /api/v1/admin/users
 * - GET /api/v1/admin/users/:id
 * - PUT /api/v1/admin/users/:id
 * - PATCH /api/v1/admin/users/:id/status
 */

'use strict';

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const {
  createTestUser,
  loginUser,
  cleanupTestUsers,
} = require('./testHelper');

describe('Integration: Admin Management Routes', () => {
  const createdUserIds = [];
  let adminSession;
  let facultySession;
  let studentSession;
  let adminUser;
  let facultyUser;
  let studentUser;

  beforeAll(async () => {
    adminUser = await createTestUser('ADMIN', 'AdminPass123!');
    facultyUser = await createTestUser('FACULTY', 'FacultyPass123!');
    studentUser = await createTestUser('STUDENT', 'StudentPass123!');

    createdUserIds.push(adminUser.id, facultyUser.id, studentUser.id);

    adminSession = await loginUser(app, adminUser.username, adminUser.password);
    facultySession = await loginUser(app, facultyUser.username, facultyUser.password);
    studentSession = await loginUser(app, studentUser.username, studentUser.password);
  });

  afterAll(async () => {
    await cleanupTestUsers(createdUserIds);
  });

  describe('Authentication & Authorization Guards', () => {
    it('should return HTTP 401 when Authorization header is absent', async () => {
      const res = await request(app).get('/api/v1/admin/users');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return HTTP 403 when FACULTY attempts to access admin routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${facultySession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You do not have permission to access this resource.');
    });

    it('should return HTTP 403 when STUDENT attempts to access admin routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${studentSession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You do not have permission to access this resource.');
    });
  });

  describe('GET /api/v1/admin/users', () => {
    it('should return paginated user list for authenticated ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.pageSize).toBe(10);
      expect(Array.isArray(res.body.data.users)).toBe(true);

      // Verify no sensitive fields leaked
      for (const user of res.body.data.users) {
        expect(user.password_hash).toBeUndefined();
        expect(user.password_reset_token_hash).toBeUndefined();
      }
    });

    it('should return 400 for invalid page number', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?page=0')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for pageSize exceeding maximum (> 100)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?pageSize=101')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/admin/users', () => {
    it('should allow ADMIN to provision a new FACULTY user', async () => {
      const username = `admin_prov_fac_${Date.now()}`;
      const email = `${username}@college.edu`;

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({
          username,
          email,
          password: 'TemporaryPass123!',
          role: 'FACULTY',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.username).toBe(username);
      expect(res.body.data.user.role).toBe('FACULTY');
      createdUserIds.push(res.body.data.user.id);
    });

    it('should allow ADMIN to provision a new STUDENT user', async () => {
      const username = `admin_prov_stu_${Date.now()}`;
      const email = `${username}@college.edu`;

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({
          username,
          email,
          password: 'TemporaryPass123!',
          role: 'STUDENT',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('STUDENT');
      createdUserIds.push(res.body.data.user.id);
    });

    it('should return HTTP 409 Conflict for duplicate username', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({
          username: studentUser.username,
          email: `unique_${Date.now()}@college.edu`,
          password: 'TemporaryPass123!',
          role: 'STUDENT',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should return HTTP 400 for invalid role', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({
          username: `user_${Date.now()}`,
          email: `user_${Date.now()}@college.edu`,
          password: 'TemporaryPass123!',
          role: 'SUPERUSER',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/admin/users/:id', () => {
    it('should return user details for existing ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/users/${studentUser.id}`)
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.user.id)).toBe(Number(studentUser.id));
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should return HTTP 404 for non-existent user ID', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users/999999999')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return HTTP 400 for non-numeric ID', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users/abc')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/admin/users/:id', () => {
    it('should allow ADMIN to update role of another user', async () => {
      const target = await createTestUser('STUDENT', 'Password123!');
      createdUserIds.push(target.id);

      const res = await request(app)
        .put(`/api/v1/admin/users/${target.id}`)
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({ role: 'FACULTY' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('FACULTY');
    });

    it('should reject self-demotion when ADMIN attempts to demote own account with HTTP 400', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({ role: 'STUDENT' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/demote/i);
    });
  });

  describe('PATCH /api/v1/admin/users/:id/status', () => {
    it('should allow ADMIN to deactivate and reactivate a user account', async () => {
      const target = await createTestUser('FACULTY', 'Password123!');
      createdUserIds.push(target.id);

      // Deactivate
      const deactRes = await request(app)
        .patch(`/api/v1/admin/users/${target.id}/status`)
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({ is_active: false });

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.success).toBe(true);
      expect(deactRes.body.data.user.is_active).toBe(0);

      // Reactivate
      const reactRes = await request(app)
        .patch(`/api/v1/admin/users/${target.id}/status`)
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({ is_active: true });

      expect(reactRes.status).toBe(200);
      expect(reactRes.body.success).toBe(true);
      expect(reactRes.body.data.user.is_active).toBe(1);
    });

    it('should reject self-deactivation when ADMIN attempts to deactivate own account with HTTP 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminUser.id}/status`)
        .set('Authorization', `Bearer ${adminSession.token}`)
        .send({ is_active: false });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/deactivate/i);
    });
  });
});
