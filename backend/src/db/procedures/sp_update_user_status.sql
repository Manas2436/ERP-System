-- =============================================================================
-- backend/src/db/procedures/sp_update_user_status.sql
--
-- Stored Procedure: sp_update_user_status
-- Purpose: Safely activates or deactivates a user account.
-- Audit: State transitions automatically recorded by trg_users_after_update.
-- =============================================================================

DROP PROCEDURE IF EXISTS `sp_update_user_status`;
CREATE PROCEDURE `sp_update_user_status`(
  IN p_user_id   BIGINT UNSIGNED,
  IN p_is_active TINYINT(1)
)
BEGIN
  DECLARE v_exists INT DEFAULT 0;

  -- Validate user_id
  IF p_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: User ID is required.';
  END IF;

  -- Validate status flag
  IF p_is_active IS NULL OR p_is_active NOT IN (0, 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation error: Status must be 0 (inactive) or 1 (active).';
  END IF;

  -- Confirm user exists
  SELECT COUNT(1) INTO v_exists FROM `users` WHERE `id` = p_user_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'User not found.';
  END IF;

  -- Update status (triggers trg_users_after_update if value changes)
  UPDATE `users`
  SET `is_active` = p_is_active
  WHERE `id` = p_user_id;

  SELECT p_user_id AS `id`, p_is_active AS `is_active`;
END;
