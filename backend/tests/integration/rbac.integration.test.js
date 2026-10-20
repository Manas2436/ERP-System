/**
 * backend/tests/integration/rbac.integration.test.js
 *
 * Integration tests verifying Role-Based Access Control (RBAC):
 * - Confirms each role cannot access other roles' endpoints (403 expected)
 * - Verifies unauthenticated requests are rejected with 401
 * - Tests full matrix across ADMIN, FACULTY, and STUDENT roles
 */

'use strict';

const request = require('supertest');
const express = require('express');
const app = require('../../src/app');
const { verifyToken, requireRole } = require('../../src/middleware');
const { signAccessToken } = require('../../src/utils/jwt');
const {
  createTestUser,
  loginUser,
  cleanupTestUsers,
} = require('./testHelper');

// Mount simulated cross-module endpoints on a sub-router for RBAC verification
function createSimulatedRouter() {
  const router = express.Router();

  // Student-only route (e.g. view personal grades)
  router.get('/student/grades', verifyToken, requireRole('STUDENT'), (req, res) => {
    res.json({ success: true, message: 'Student grades retrieved.' });
  });

  // Faculty-only route (e.g. grade entry)
  router.post('/faculty/grade-entry', verifyToken, requireRole('FACULTY'), (req, res) => {
    res.json({ success: true, message: 'Grade recorded successfully.' });
  });

  // Staff-only route (Faculty + Admin)
  router.get('/staff/directory', verifyToken, requireRole('ADMIN', 'FACULTY'), (req, res) => {
    res.json({ success: true, message: 'Staff directory retrieved.' });
  });

  return router;
}

describe('Integration: Role-Based Access Control (RBAC) Enforcement', () => {
  const createdUserIds = [];
  let adminSession;
  let facultySession;
  let studentSession;
  let testApp;

  beforeAll(async () => {
    const adminUser = await createTestUser('ADMIN', 'AdminPass123!');
    const facultyUser = await createTestUser('FACULTY', 'FacultyPass123!');
    const studentUser = await createTestUser('STUDENT', 'StudentPass123!');

    createdUserIds.push(adminUser.id, facultyUser.id, studentUser.id);

    adminSession = await loginUser(app, adminUser.username, adminUser.password);
    facultySession = await loginUser(app, facultyUser.username, facultyUser.password);
    studentSession = await loginUser(app, studentUser.username, studentUser.password);

    // Create an express app incorporating both existing auth/admin routes and simulated cross-module routes
    testApp = express();
    testApp.use(express.json());
    testApp.use('/api/v1/simulated', createSimulatedRouter());
    testApp.use(app); // mounts existing backend app
  });

  afterAll(async () => {
    await cleanupTestUsers(createdUserIds);
  });

  describe('1. Unauthenticated Requests to Protected Endpoints', () => {
    it('should reject unauthenticated request to /api/v1/admin/users with HTTP 401', async () => {
      const res = await request(testApp).get('/api/v1/admin/users');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request to /api/v1/simulated/student/grades with HTTP 401', async () => {
      const res = await request(testApp).get('/api/v1/simulated/student/grades');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request to /api/v1/simulated/faculty/grade-entry with HTTP 401', async () => {
      const res = await request(testApp).post('/api/v1/simulated/faculty/grade-entry');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Student Role Access Boundaries', () => {
    it('STUDENT CAN access student-only route (HTTP 200)', async () => {
      const res = await request(testApp)
        .get('/api/v1/simulated/student/grades')
        .set('Authorization', `Bearer ${studentSession.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('STUDENT CANNOT access admin users list (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${studentSession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You do not have permission to access this resource.');
    });

    it('STUDENT CANNOT access admin user provisioning (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${studentSession.token}`)
        .send({ username: 'any', email: 'any@college.edu', password: 'Password123!', role: 'STUDENT' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('STUDENT CANNOT access faculty grade-entry route (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .post('/api/v1/simulated/faculty/grade-entry')
        .set('Authorization', `Bearer ${studentSession.token}`)
        .send({ studentId: 1, grade: 'A' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('STUDENT CANNOT access staff directory route (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .get('/api/v1/simulated/staff/directory')
        .set('Authorization', `Bearer ${studentSession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Faculty Role Access Boundaries', () => {
    it('FACULTY CAN access faculty grade-entry route (HTTP 200)', async () => {
      const res = await request(testApp)
        .post('/api/v1/simulated/faculty/grade-entry')
        .set('Authorization', `Bearer ${facultySession.token}`)
        .send({ studentId: 1, grade: 'A' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('FACULTY CAN access shared staff directory (HTTP 200)', async () => {
      const res = await request(testApp)
        .get('/api/v1/simulated/staff/directory')
        .set('Authorization', `Bearer ${facultySession.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('FACULTY CANNOT access admin users list (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${facultySession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You do not have permission to access this resource.');
    });

    it('FACULTY CANNOT access student grades route (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .get('/api/v1/simulated/student/grades')
        .set('Authorization', `Bearer ${facultySession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Admin Role Access Boundaries', () => {
    it('ADMIN CAN access admin users list (HTTP 200)', async () => {
      const res = await request(testApp)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('ADMIN CAN access shared staff directory (HTTP 200)', async () => {
      const res = await request(testApp)
        .get('/api/v1/simulated/staff/directory')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('ADMIN CANNOT access student-only route (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .get('/api/v1/simulated/student/grades')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You do not have permission to access this resource.');
    });

    it('ADMIN CANNOT access faculty-only route (HTTP 403 Forbidden)', async () => {
      const res = await request(testApp)
        .post('/api/v1/simulated/faculty/grade-entry')
        .set('Authorization', `Bearer ${adminSession.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Error Response Shape Security Checks', () => {
    it('HTTP 403 responses must never leak role lists or internal schema', async () => {
      const res = await request(testApp)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${studentSession.token}`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        success: false,
        message: 'You do not have permission to access this resource.',
        data: null,
        errors: null,
      });
    });
  });
});
