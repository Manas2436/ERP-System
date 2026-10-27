class MarksWorkflowError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'MarksWorkflowError';
    this.statusCode = statusCode;
  }
}

async function submitMarks({ role, facultyId, registrationId, marks }, { query, callProcedure }) {
  if (!Number.isInteger(registrationId) || registrationId < 1) {
    throw new MarksWorkflowError(400, 'Enter a valid exam registration.');
  }
  if (typeof marks !== 'number' || !Number.isFinite(marks)) {
    throw new MarksWorkflowError(400, 'Marks must be a valid number.');
  }

  const registration = (await query(
    `SELECT er.exam_registration_id, ex.max_marks, ex.results_published,
       EXISTS(SELECT 1 FROM course_allocation ca
              WHERE ca.offering_id=ex.offering_id AND ca.faculty_id=?) AS faculty_assigned
     FROM exam_registration er
     JOIN exam ex ON ex.exam_id=er.exam_id
     WHERE er.exam_registration_id=?`,
    [facultyId ?? null, registrationId],
  ))[0];

  if (!registration) {
    throw new MarksWorkflowError(404, 'Exam registration was not found. Refresh the registration list and try again.');
  }
  if (role === 'FACULTY' && !Number(registration.faculty_assigned)) {
    throw new MarksWorkflowError(403, 'You are not assigned to this offering.');
  }
  if (Number(registration.results_published)) {
    throw new MarksWorkflowError(409, 'Results are already published. Marks can no longer be entered or changed.');
  }
  if (marks < 0 || marks > Number(registration.max_marks)) {
    throw new MarksWorkflowError(400, `Marks must be between 0 and ${registration.max_marks}.`);
  }
  if (Math.abs(marks * 100 - Math.round(marks * 100)) > 1e-7) {
    throw new MarksWorkflowError(400, 'Marks can have at most two decimal places.');
  }

  return callProcedure('sp_submit_marks', [registrationId, marks, facultyId ?? null]);
}

module.exports = { MarksWorkflowError, submitMarks };
