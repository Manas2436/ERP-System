USE examination_erp;

SELECT
    s.student_id,
    s.student_name,
    e.exam_name,
    r.marks_obtained,
    r.max_marks,
    ROUND((r.marks_obtained / r.max_marks) * 100, 2) AS percentage,
    r.grade_point,
    CASE
        WHEN (r.marks_obtained / r.max_marks) * 100 >= 40
        THEN 'PASS'
        ELSE 'FAIL'
    END AS result_status
FROM exam_result r
JOIN exam_registration er
    ON r.registration_id = er.registration_id
JOIN student s
    ON er.student_id = s.student_id
JOIN exam_schedule es
    ON er.schedule_id = es.schedule_id
JOIN exam e
    ON es.exam_id = e.exam_id
ORDER BY percentage DESC;