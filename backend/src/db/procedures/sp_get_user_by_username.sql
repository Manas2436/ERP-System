-- =============================================================================
-- backend/src/db/procedures/sp_get_user_by_username.sql
--
-- Stored Procedure: sp_get_user_by_username
-- Purpose: Fetches user record by username for backend login credential validation.
-- Security: Internal procedure called by backend authentication service only.
-- =============================================================================

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
