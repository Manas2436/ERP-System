-- =============================================================================
-- backend/src/db/triggers/trg_users_after_update.sql
--
-- Trigger: trg_users_after_update
-- Timing: AFTER UPDATE ON users
-- Purpose: Records changes to account active status (`is_active`) and role (`role`)
--          into the dedicated `user_audit_logs` table.
-- Security: Strictly audits non-sensitive status transitions. Never logs passwords,
--           hashes, reset tokens, or session secrets.
-- Recursion: Zero recursion risk because updates on `users` insert into `user_audit_logs`.
-- Note on updated_at: Automatically managed by MySQL `ON UPDATE CURRENT_TIMESTAMP`;
--                     no redundant trigger logic is required.
-- =============================================================================

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
