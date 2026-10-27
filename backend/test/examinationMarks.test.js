const test = require('node:test');
const assert = require('node:assert/strict');
const { submitMarks } = require('../src/services/examinationMarks');
const { buildExamRegistrationListQuery } = require('../src/services/examinationRegistrations');
const { errors } = require('../src/middleware/errors');

function fixtures(registration = { exam_registration_id: 1, max_marks: 100, results_published: 0, faculty_assigned: 1 }) {
  const calls = { query: [], procedure: [] };
  return {
    calls,
    dependencies: {
      query: async (...args) => { calls.query.push(args); return registration ? [registration] : []; },
      callProcedure: async (...args) => { calls.procedure.push(args); return { exam_registration_id: 1 }; },
    },
  };
}

async function rejection(action, statusCode, text) {
  await assert.rejects(action, error => {
    assert.equal(error.statusCode, statusCode);
    assert.match(error.message, text);
    return true;
  });
}

test('assigned faculty can enter valid marks before publication', async () => {
  const { calls, dependencies } = fixtures();
  await submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 1, marks: 90 }, dependencies);
  assert.deepEqual(calls.procedure, [['sp_submit_marks', [1, 90, 7]]]);
  assert.deepEqual(calls.query[0][1], [7, 1]);
});

test('marks above the exam maximum are rejected before SQL write', async () => {
  const { calls, dependencies } = fixtures();
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 1, marks: 100.5 }, dependencies), 400, /between 0 and 100/);
  assert.equal(calls.procedure.length, 0);
});

test('published marks cannot be entered or modified', async () => {
  const { calls, dependencies } = fixtures({ exam_registration_id: 1, max_marks: 100, results_published: 1, faculty_assigned: 1 });
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 1, marks: 90 }, dependencies), 409, /already published/);
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 1, marks: 95 }, dependencies), 409, /already published/);
  assert.equal(calls.procedure.length, 0);
});

test('faculty cannot enter marks for an offering assigned to another faculty member', async () => {
  const { calls, dependencies } = fixtures({ exam_registration_id: 1, max_marks: 100, results_published: 0, faculty_assigned: 0 });
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 8, registrationId: 1, marks: 90 }, dependencies), 403, /not assigned/);
  assert.deepEqual(calls.query[0][1], [8, 1]);
  assert.equal(calls.procedure.length, 0);
});

test('faculty registration list is restricted to the authenticated faculty identity', () => {
  const { sql, params } = buildExamRegistrationListQuery({ role: 'FACULTY', faculty_id: 8 });
  assert.match(sql, /JOIN course_allocation ca ON ca\.offering_id=co\.offering_id/);
  assert.match(sql, /AND ca\.faculty_id=\?/);
  assert.deepEqual(params, [8]);
});

test('unknown registration IDs receive a not-found error', async () => {
  const { calls, dependencies } = fixtures(null);
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 999, marks: 90 }, dependencies), 404, /registration was not found/);
  assert.equal(calls.procedure.length, 0);
});

test('invalid registration IDs and invalid marks are rejected', async () => {
  const fixture = fixtures();
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 0, marks: 90 }, fixture.dependencies), 400, /valid exam registration/);
  await rejection(submitMarks({ role: 'FACULTY', facultyId: 7, registrationId: 1, marks: Number.NaN }, fixture.dependencies), 400, /valid number/);
  assert.equal(fixture.calls.query.length, 0);
  assert.equal(fixture.calls.procedure.length, 0);
});

test('database business-rule errors are translated to specific safe API messages', () => {
  for (const [sqlMessage, statusCode, message] of [
    ['Published marks are locked', 409, /already published/],
    ['Marks outside exam range', 400, /allowed range/],
    ['Invalid exam registration', 404, /registration was not found/],
    ['Faculty is not assigned to this offering', 403, /not assigned/],
  ]) {
    let response;
    const res = { headersSent: false, status(code) { response = { status: code }; return this; }, json(body) { response.body = body; return this; } };
    errors({ sqlState: '45000', sqlMessage, sql: 'internal statement' }, {}, res, error => { throw error; });
    assert.equal(response.status, statusCode);
    assert.match(response.body.error.message, message);
    assert.equal(JSON.stringify(response).includes('internal statement'), false);
  }
});
