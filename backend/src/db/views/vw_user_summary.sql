-- =============================================================================
-- backend/src/db/views/vw_user_summary.sql
--
-- View: vw_user_summary
-- Purpose: Administrative user overview exposing user metadata without secrets.
-- Security: Never exposes password_hash or password_reset_token_hash.
-- =============================================================================

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
