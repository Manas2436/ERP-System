/**
 * backend/tests/integration/testHelper.js
 *
 * Reusable test helpers for integration tests using Supertest.
 */

'use strict';

const request = require('supertest');
const db = require('../../src/config/db');
const { hashPassword } = require('../../src/utils/password');

/**
 * Solves the arithmetic question returned by the CAPTCHA service.
 * E.g., "What is 12 + 5?" -> "17"
 */
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

/**
 * Creates a unique test user in the database using sp_create_user.
 */
async function createTestUser(role = 'STUDENT', initialPassword = 'InitialPassword123!', createdBy = null) {
  const username = `it_user_${role.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const email = `${username}@college.edu`;
  const passHash = await hashPassword(initialPassword);

  const [res] = await db.query(
    'CALL sp_create_user(?, ?, ?, ?, ?, @out_user_id)',
    [username, email, passHash, role, createdBy]
  );
  const userId = res[0][0].user_id;

  return { id: userId, username, email, password: initialPassword, role };
}

/**
 * Logs in a user via the live Supertest endpoint, solving CAPTCHA automatically.
 */
async function loginUser(app, username, password) {
  const capRes = await request(app).get('/api/v1/auth/captcha');
  const captchaId = capRes.body.data.captchaId;
  const answer = solveCaptchaQuestion(capRes.body.data.question);

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({
      username,
      password,
      captchaId,
      captchaAnswer: answer,
    });

  return {
    status: loginRes.status,
    body: loginRes.body,
    token: loginRes.body.data ? loginRes.body.data.token : null,
    refreshToken: loginRes.body.data ? loginRes.body.data.refreshToken : null,
    user: loginRes.body.data ? loginRes.body.data.user : null,
  };
}

/**
 * Safely removes test users created during integration tests.
 */
async function cleanupTestUsers(userIds) {
  if (!userIds || userIds.length === 0) return;
  try {
    await db.query('DELETE FROM `users` WHERE `id` IN (?)', [userIds]);
  } catch (err) {
    // Ignore cleanup error if already removed
  }
}

module.exports = {
  solveCaptchaQuestion,
  createTestUser,
  loginUser,
  cleanupTestUsers,
};
