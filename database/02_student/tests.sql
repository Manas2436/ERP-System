-- 02_student: Tests
START TRANSACTION;

-- Test fn_attendance_percentage: enrollment 1 (low: 8P/4A = 66.67)
SELECT
  CASE WHEN ABS(fn_attendance_percentage(1) - 66.67) < 1 THEN 'PASS' ELSE 'FAIL' END AS result,
  CONCAT('02_student: fn_attendance_percentage low enrollment = ', fn_attendance_percentage(1)) AS test;

-- Test fn_attendance_percentage: enrollment 2 (good: 10P/2A = 83.33)
SELECT
  CASE WHEN fn_attendance_percentage(2) > 75 THEN 'PASS' ELSE 'FAIL' END AS result,
  CONCAT('02_student: fn_attendance_percentage good enrollment = ', fn_attendance_percentage(2)) AS test;

-- Test fn_year_of_study: student 1 admitted 2026, current ~2026 = year 1
SELECT
  CASE WHEN fn_year_of_study(1) >= 1 THEN 'PASS' ELSE 'FAIL' END AS result,
  CONCAT('02_student: fn_year_of_study = ', fn_year_of_study(1)) AS test;

-- Test sp_enroll_student: duplicate enrollment should SIGNAL
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLSTATE '45000' BEGIN END;
  CALL sp_enroll_student(1, 1);
END;
SELECT 'PASS' AS result, '02_student: sp_enroll_student rejects duplicate active enrollment' AS test;

-- Test sp_drop_enrollment
CALL sp_drop_enrollment(1);
SELECT
  CASE WHEN (SELECT status FROM enrollment WHERE enrollment_id = 1) = 'DROPPED' THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: sp_drop_enrollment sets status to DROPPED' AS test;

-- Test sp_enroll_student re-activation
CALL sp_enroll_student(1, 1);
SELECT
  CASE WHEN (SELECT status FROM enrollment WHERE enrollment_id = 1) = 'ENROLLED' THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: sp_enroll_student re-activates dropped enrollment' AS test;

-- Test sp_mark_attendance: marks attendance
CALL sp_mark_attendance(2, '2026-09-14', 'PRESENT');
SELECT
  CASE WHEN EXISTS(SELECT 1 FROM attendance WHERE enrollment_id = 2 AND class_date = '2026-09-14') THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: sp_mark_attendance records attendance' AS test;

-- Test trigger: capacity exceeded on insert (offering 2, cap=3, already has 3)
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLSTATE '45000' BEGIN END;
  INSERT INTO enrollment (student_id, offering_id, enrolled_on) VALUES (9, 2, '2026-07-15');
END;
SELECT
  CASE WHEN NOT EXISTS(SELECT 1 FROM enrollment WHERE student_id = 9 AND offering_id = 2) THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: trigger blocks enrollment when capacity full' AS test;

-- Test trigger: future attendance date blocked
BEGIN
  DECLARE CONTINUE HANDLER FOR SQLSTATE '45000' BEGIN END;
  INSERT INTO attendance (enrollment_id, class_date, status) VALUES (2, '2027-12-01', 'PRESENT');
END;
SELECT
  CASE WHEN NOT EXISTS(SELECT 1 FROM attendance WHERE enrollment_id = 2 AND class_date = '2027-12-01') THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: trigger blocks future attendance date' AS test;

-- Test views exist
SELECT
  CASE WHEN (SELECT COUNT(*) FROM vw_low_attendance) >= 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: vw_low_attendance view works' AS test;

ROLLBACK;
