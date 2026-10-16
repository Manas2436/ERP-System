-- =============================================================================
-- backend/src/db/procedures/sp_update_user_role.sql
--
-- Stored Procedure: sp_update_user_role
-- Purpose: Safely updates an account role with normalization and validation.
-- Audit: Role changes automatically recorded by trg_users_after_update.
-- =============================================================================

DROP PROCEDURE IF EXISTS `sp_update_user_role`;
CREATE PROCEDURE `sp_update_user_role`(
  IN p_user_id BIGINT UNSIGNED,
  IN p_role    VARCHAR(20)
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_normalized_role VARCHAR(20);

  -- Validate user_id
  IF p_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: User ID is required.';
  END IF;

  -- Validate role
  SET v_normalized_role = `fn_normalize_role`(p_role);
  IF v_normalized_role IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Invalid role. Allowed roles are ADMIN, FACULTY, STUDENT.';
  END IF;

  -- Confirm user exists
  SELECT COUNT(1) INTO v_exists FROM `users` WHERE `id` = p_user_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'User not found.';
  END IF;

  -- Update role (triggers trg_users_after_update if value changes)
  UPDATE `users`
  SET `role` = v_normalized_role
  WHERE `id` = p_user_id;

  SELECT p_user_id AS `id`, v_normalized_role AS `role`;
END;
