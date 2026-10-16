-- =============================================================================
-- backend/src/db/procedures/sp_create_user.sql
--
-- Stored Procedure: sp_create_user
-- Purpose: Safely creates an account with username, email, password_hash, and role.
-- Validation: Validates required fields and allowed roles ('ADMIN', 'FACULTY', 'STUDENT').
-- Security: Expects pre-hashed password (bcrypt); never receives or stores plaintext.
-- Concurrency: Relies on database unique constraints for username and email uniqueness.
-- =============================================================================

DROP PROCEDURE IF EXISTS `sp_create_user`;
CREATE PROCEDURE `sp_create_user`(
  IN  p_username      VARCHAR(50),
  IN  p_email         VARCHAR(100),
  IN  p_password_hash VARCHAR(255),
  IN  p_role          VARCHAR(20),
  IN  p_created_by    BIGINT UNSIGNED,
  OUT p_user_id       BIGINT UNSIGNED
)
BEGIN
  DECLARE v_normalized_role VARCHAR(20);

  -- Validate required username
  IF p_username IS NULL OR TRIM(p_username) = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Username is required and cannot be empty.';
  END IF;

  -- Validate required email
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Email is required and cannot be empty.';
  END IF;

  -- Validate required password hash (never accept plaintext or empty string)
  IF p_password_hash IS NULL OR TRIM(p_password_hash) = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Password hash is required and cannot be empty.';
  END IF;

  -- Validate allowed roles using deterministic normalizer
  SET v_normalized_role = `fn_normalize_role`(p_role);
  IF v_normalized_role IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Invalid role. Allowed roles are ADMIN, FACULTY, STUDENT.';
  END IF;

  -- Validate created_by reference if provided
  IF p_created_by IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM `users` WHERE `id` = p_created_by) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Validation error: Referenced created_by user does not exist.';
    END IF;
  END IF;

  -- Insert record; reliance on uq_users_username & uq_users_email constraints for uniqueness
  INSERT INTO `users` (
    `username`,
    `email`,
    `password_hash`,
    `role`,
    `is_active`,
    `created_by`
  ) VALUES (
    TRIM(p_username),
    LOWER(TRIM(p_email)),
    p_password_hash,
    v_normalized_role,
    1,
    p_created_by
  );

  SET p_user_id = LAST_INSERT_ID();
  SELECT p_user_id AS `user_id`;
END;
