-- =============================================================================
-- backend/src/db/migrations/002_create_auth_views_procedures_triggers_udfs.sql
--
-- Stage 5: Authentication Module — Views, Procedures, Triggers, and UDFs
--
-- Database: college_erp
--
-- Purpose & Architecture:
--   1. TABLE: `user_audit_logs`
--      Provides a narrowly scoped audit log for critical administrative state
--      changes (account status and role). Retains old/new values, target user,
--      and timestamp.
--      Retention policy: Retain according to institutional compliance policy
--      (typically 90-365 days). Maintenance tasks should archive or prune
--      older records. Sensitive secrets (passwords, tokens) are NEVER logged.
--
--   2. VIEWS:
--      - `vw_user_summary`: Administrative user overview exposing user ID,
--        username, email, role, active status, lockout state, and timestamps.
--        CRITICAL: Never exposes password_hash or reset tokens.
--      - `vw_active_users`: Directory view exposing only currently active accounts
--        (is_active = 1) with non-sensitive metadata for cross-module queries.
--
--   3. FUNCTIONS (UDFs):
--      - `fn_normalize_role`: Deterministic, read-only function that trims and
--        validates role strings, returning the canonical role ('ADMIN', 'FACULTY',
--        'STUDENT') or NULL if invalid.
--      - `fn_format_role_label`: Deterministic, read-only function translating
--        canonical role ENUMs to human-readable presentation labels.
--      - `fn_get_account_status`: Deterministic, read-only evaluation of account
--        state ('ACTIVE', 'LOCKED', 'INACTIVE') based on status flag, lockout
--        expiry, and a caller-supplied reference timestamp.
--
--   4. STORED PROCEDURES:
--      - `sp_create_user`: Safely provisions a user account with input and role
--        validation, relying on database unique constraints for uniqueness.
--      - `sp_update_user_status`: Safely updates an account active/inactive status.
--      - `sp_update_user_role`: Safely updates an account role with validation.
--      - `sp_get_user_by_username`: Retrieves internal user record for login.
--
--   5. TRIGGER:
--      - `trg_users_after_update`: Narrowly scoped audit trigger on `users`.
--        Fires AFTER UPDATE and logs status or role changes to `user_audit_logs`.
--        NOTE on `updated_at`: The column `updated_at` is already maintained
--        automatically by MySQL's `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`.
--        No redundant trigger is created for timestamp maintenance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUDIT TABLE: user_audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `field_name` VARCHAR(50) NOT NULL,
  `old_value` VARCHAR(100) NULL DEFAULT NULL,
  `new_value` VARCHAR(100) NULL DEFAULT NULL,
  `changed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT `pk_user_audit_logs_id` PRIMARY KEY (`id`),
  CONSTRAINT `fk_user_audit_logs_user_id`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  INDEX `idx_user_audit_logs_user_id` (`user_id`),
  INDEX `idx_user_audit_logs_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit trail for administrative changes to user status and role. Retain per institutional policy (recommended: 90-365 days).';

-- -----------------------------------------------------------------------------
-- 2. VIEWS (Exposing non-sensitive metadata only)
-- -----------------------------------------------------------------------------

-- View: Administrative user overview (no secret hashes or tokens exposed)
CREATE OR REPLACE VIEW `vw_user_summary` AS
SELECT
  `id`,
  `username`,
  `email`,
  `role`,
  `is_active`,
  `failed_login_attempts`,
  `locked_until`,
  `last_login_at`,
  `created_by`,
  `created_at`,
  `updated_at`
FROM `users`;

-- View: Active users directory
CREATE OR REPLACE VIEW `vw_active_users` AS
SELECT
  `id`,
  `username`,
  `email`,
  `role`,
  `last_login_at`,
  `created_at`,
  `updated_at`
FROM `users`
WHERE `is_active` = 1;

-- -----------------------------------------------------------------------------
-- 3. USER-DEFINED FUNCTIONS (Deterministic, read-only utilities)
-- -----------------------------------------------------------------------------

-- Function: Normalizes role strings to canonical ENUM values or NULL
DROP FUNCTION IF EXISTS `fn_normalize_role`;
CREATE FUNCTION `fn_normalize_role`(p_role VARCHAR(50))
RETURNS VARCHAR(20)
DETERMINISTIC
NO SQL
BEGIN
  DECLARE v_clean VARCHAR(50);
  IF p_role IS NULL THEN
    RETURN NULL;
  END IF;

  SET v_clean = UPPER(TRIM(p_role));

  IF v_clean IN ('ADMIN', 'FACULTY', 'STUDENT') THEN
    RETURN v_clean;
  ELSE
    RETURN NULL;
  END IF;
END;

-- Function: Translates canonical role to human-friendly display label
DROP FUNCTION IF EXISTS `fn_format_role_label`;
CREATE FUNCTION `fn_format_role_label`(p_role VARCHAR(20))
RETURNS VARCHAR(50)
DETERMINISTIC
NO SQL
BEGIN
  IF p_role IS NULL THEN
    RETURN 'Unknown';
  END IF;

  CASE UPPER(TRIM(p_role))
    WHEN 'ADMIN' THEN RETURN 'Administrator';
    WHEN 'FACULTY' THEN RETURN 'Faculty Member';
    WHEN 'STUDENT' THEN RETURN 'Enrolled Student';
    ELSE RETURN 'Unknown';
  END CASE;
END;

-- Function: Evaluates account status given flags and reference timestamp
DROP FUNCTION IF EXISTS `fn_get_account_status`;
CREATE FUNCTION `fn_get_account_status`(
  p_is_active TINYINT,
  p_locked_until DATETIME,
  p_reference_time DATETIME
)
RETURNS VARCHAR(20)
DETERMINISTIC
NO SQL
BEGIN
  IF p_is_active IS NULL OR p_is_active = 0 THEN
    RETURN 'INACTIVE';
  ELSEIF p_locked_until IS NOT NULL AND p_reference_time IS NOT NULL AND p_locked_until > p_reference_time THEN
    RETURN 'LOCKED';
  ELSE
    RETURN 'ACTIVE';
  END IF;
END;

-- -----------------------------------------------------------------------------
-- 4. STORED PROCEDURES
-- -----------------------------------------------------------------------------

-- Procedure: Safe account creation
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

-- Procedure: Update user account active status
DROP PROCEDURE IF EXISTS `sp_update_user_status`;
CREATE PROCEDURE `sp_update_user_status`(
  IN p_user_id   BIGINT UNSIGNED,
  IN p_is_active TINYINT(1)
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;

  IF p_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: User ID is required.';
  END IF;

  IF p_is_active IS NULL OR p_is_active NOT IN (0, 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Status must be 0 (inactive) or 1 (active).';
  END IF;

  SELECT COUNT(1) INTO v_exists FROM `users` WHERE `id` = p_user_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'User not found.';
  END IF;

  UPDATE `users`
  SET `is_active` = p_is_active
  WHERE `id` = p_user_id;

  SELECT p_user_id AS `id`, p_is_active AS `is_active`;
END;

-- Procedure: Update user role
DROP PROCEDURE IF EXISTS `sp_update_user_role`;
CREATE PROCEDURE `sp_update_user_role`(
  IN p_user_id BIGINT UNSIGNED,
  IN p_role    VARCHAR(20)
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_normalized_role VARCHAR(20);

  IF p_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: User ID is required.';
  END IF;

  SET v_normalized_role = `fn_normalize_role`(p_role);
  IF v_normalized_role IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Invalid role. Allowed roles are ADMIN, FACULTY, STUDENT.';
  END IF;

  SELECT COUNT(1) INTO v_exists FROM `users` WHERE `id` = p_user_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'User not found.';
  END IF;

  UPDATE `users`
  SET `role` = v_normalized_role
  WHERE `id` = p_user_id;

  SELECT p_user_id AS `id`, v_normalized_role AS `role`;
END;

-- Procedure: Fetch user record by username for login verification
DROP PROCEDURE IF EXISTS `sp_get_user_by_username`;
CREATE PROCEDURE `sp_get_user_by_username`(
  IN p_username VARCHAR(50)
)
BEGIN
  IF p_username IS NULL OR TRIM(p_username) = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Username is required.';
  END IF;

  SELECT
    `id`,
    `username`,
    `email`,
    `password_hash`,
    `role`,
    `is_active`,
    `failed_login_attempts`,
    `locked_until`,
    `last_login_at`,
    `created_at`,
    `updated_at`
  FROM `users`
  WHERE `username` = TRIM(p_username)
  LIMIT 1;
END;

-- -----------------------------------------------------------------------------
-- 5. TRIGGERS
-- -----------------------------------------------------------------------------

-- Trigger: Audit administrative status and role changes
DROP TRIGGER IF EXISTS `trg_users_after_update`;
CREATE TRIGGER `trg_users_after_update`
AFTER UPDATE ON `users`
FOR EACH ROW
BEGIN
  -- Record status changes (e.g. active -> inactive or vice versa)
  IF NOT (OLD.is_active <=> NEW.is_active) THEN
    INSERT INTO `user_audit_logs` (
      `user_id`,
      `action`,
      `field_name`,
      `old_value`,
      `new_value`
    ) VALUES (
      NEW.id,
      'STATUS_CHANGE',
      'is_active',
      CAST(OLD.is_active AS CHAR),
      CAST(NEW.is_active AS CHAR)
    );
  END IF;

  -- Record role changes (e.g. STUDENT -> FACULTY)
  IF NOT (OLD.role <=> NEW.role) THEN
    INSERT INTO `user_audit_logs` (
      `user_id`,
      `action`,
      `field_name`,
      `old_value`,
      `new_value`
    ) VALUES (
      NEW.id,
      'ROLE_CHANGE',
      'role',
      OLD.role,
      NEW.role
    );
  END IF;
END;
