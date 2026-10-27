-- Non-destructive upgrade for installations that already have the examination schema.
-- Replaces only the marks submission procedure; no exam, registration, or marks rows are changed.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_submit_marks$$
CREATE PROCEDURE sp_submit_marks(IN p_registration INT UNSIGNED,IN p_marks DECIMAL(5,2),IN p_faculty INT UNSIGNED)
BEGIN
  DECLARE v_exam INT UNSIGNED DEFAULT NULL;
  DECLARE v_offering INT UNSIGNED;
  DECLARE v_max DECIMAL(5,2);
  DECLARE v_grade_id INT UNSIGNED;
  SELECT ex.exam_id,ex.offering_id,ex.max_marks INTO v_exam,v_offering,v_max
  FROM exam_registration er JOIN exam ex ON ex.exam_id=er.exam_id
  WHERE er.exam_registration_id=p_registration;
  IF v_exam IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid exam registration';
  END IF;
  IF p_faculty IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM course_allocation ca
    WHERE ca.offering_id=v_offering AND ca.faculty_id=p_faculty
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Faculty is not assigned to this offering';
  END IF;
  IF p_marks IS NULL OR p_marks<0 OR p_marks>v_max THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid marks value';
  END IF;
  IF EXISTS(SELECT 1 FROM exam WHERE exam_id=v_exam AND results_published=1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Published marks are locked';
  END IF;
  SELECT grade_scale_id INTO v_grade_id FROM grade_scale
  WHERE minimum_percent<=p_marks/v_max*100
  ORDER BY minimum_percent DESC LIMIT 1;
  INSERT INTO marks(exam_registration_id,marks_obtained,grade_scale_id,entered_by)
  VALUES(p_registration,p_marks,v_grade_id,p_faculty)
  ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained),
    grade_scale_id=VALUES(grade_scale_id),entered_by=VALUES(entered_by);
  SELECT p_registration exam_registration_id;
END$$
DELIMITER ;
