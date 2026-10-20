-- 02_student: Tests

DROP PROCEDURE IF EXISTS sp_test_student_expected_error;
DELIMITER $$

CREATE PROCEDURE sp_test_student_expected_error(IN p_case TINYINT UNSIGNED)
BEGIN
  DECLARE v_caught BOOLEAN DEFAULT FALSE;
  DECLARE CONTINUE HANDLER FOR SQLSTATE '45000'
    SET v_caught = TRUE;

  CASE p_case
    WHEN 1 THEN
      CALL sp_enroll_student(1, 1);
    WHEN 2 THEN
      INSERT INTO enrollment (student_id, offering_id, enrolled_on)
      VALUES (9, 2, '2026-07-15');
    WHEN 3 THEN
      INSERT INTO attendance (enrollment_id, class_date, status)
      VALUES (2, '2027-12-01', 'PRESENT');
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid test case';
  END CASE;

  SELECT
    IF(v_caught, 'PASS', 'FAIL') AS result,
    CASE p_case
      WHEN 1 THEN '02_student: duplicate enrollment raises expected error'
      WHEN 2 THEN '02_student: capacity trigger raises expected error'
      WHEN 3 THEN '02_student: future attendance raises expected error'
      ELSE '02_student: invalid test case'
    END AS test;
END$$

DELIMITER ;

START TRANSACTION;

-- Test fn_attendance_percentage: enrollment 1 (low: 8P/4A = 66.67)
SELECT
  CASE WHEN ABS(fn_attendance_percentage(1) - 66.67) < 1 THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: fn_attendance_percentage low enrollment' AS test;

-- Test fn_attendance_percentage: enrollment 2 (good: 10P/2A = 83.33)
SELECT
  CASE WHEN fn_attendance_percentage(2) > 75 THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: fn_attendance_percentage good enrollment' AS test;

-- Test fn_year_of_study: student 1 admitted 2026, current ~2026 = year 1
SELECT
  CASE WHEN fn_year_of_study(1) >= 1 THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: fn_year_of_study' AS test;

-- Test sp_enroll_student: duplicate enrollment should SIGNAL
CALL sp_test_student_expected_error(1);
SELECT
  CASE WHEN (SELECT COUNT(*) FROM enrollment
             WHERE student_id = 1 AND offering_id = 1
               AND status = 'ENROLLED') = 1
       THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: duplicate active enrollment is rejected' AS test;

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
CALL sp_test_student_expected_error(2);
SELECT
  CASE WHEN NOT EXISTS(SELECT 1 FROM enrollment WHERE student_id = 9 AND offering_id = 2) THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: trigger blocks enrollment when capacity full' AS test;

-- Test trigger: future attendance date blocked
CALL sp_test_student_expected_error(3);
SELECT
  CASE WHEN NOT EXISTS(SELECT 1 FROM attendance WHERE enrollment_id = 2 AND class_date = '2027-12-01') THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: trigger blocks future attendance date' AS test;

-- Test views exist
SELECT
  CASE WHEN (SELECT COUNT(*) FROM vw_low_attendance) >= 0 THEN 'PASS' ELSE 'FAIL' END AS result,
  '02_student: vw_low_attendance view works' AS test;

ROLLBACK;

DROP PROCEDURE IF EXISTS sp_test_student_expected_error;
