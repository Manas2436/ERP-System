-- =============================================================================
-- backend/src/db/views/vw_active_users.sql
--
-- View: vw_active_users
-- Purpose: Filtered directory view for active accounts (is_active = 1).
-- Security: Omits sensitive hashes, password reset tokens, and internal lockout counters.
-- =============================================================================

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
