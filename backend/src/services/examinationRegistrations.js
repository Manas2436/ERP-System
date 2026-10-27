function buildExamRegistrationListQuery(user) {
  const params = [];
  let scope = '';
  let facultyJoin = '';
  if (user.role === 'STUDENT') {
    scope = ' AND e.student_id=?';
    params.push(user.student_id);
  } else if (user.role === 'FACULTY') {
    facultyJoin = ' JOIN course_allocation ca ON ca.offering_id=co.offering_id';
    scope = ' AND ca.faculty_id=?';
    params.push(user.faculty_id);
  }
  const sql = `SELECT er.exam_registration_id,ex.exam_id,ex.exam_name,ex.exam_date,ex.max_marks,ex.results_published,er.exam_hall_id,eh.hall_name,er.registered_at,e.enrollment_id,e.student_id,st.enrollment_no,CONCAT(st.first_name,' ',st.last_name) student_name,c.course_code,c.course_name,m.marks_id,m.marks_obtained,gs.grade FROM exam_registration er JOIN exam ex ON ex.exam_id=er.exam_id JOIN enrollment e ON e.enrollment_id=er.enrollment_id JOIN student st ON st.student_id=e.student_id JOIN course_offering co ON co.offering_id=ex.offering_id JOIN course c ON c.course_id=co.course_id${facultyJoin} LEFT JOIN exam_hall eh ON eh.exam_hall_id=er.exam_hall_id LEFT JOIN marks m ON m.exam_registration_id=er.exam_registration_id LEFT JOIN grade_scale gs ON gs.grade_scale_id=m.grade_scale_id WHERE 1=1${scope} ORDER BY ex.exam_date,st.enrollment_no`;
  return { sql, params };
}

module.exports = { buildExamRegistrationListQuery };
