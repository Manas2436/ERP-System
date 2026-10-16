-- =============================================================================
-- backend/src/db/migrations/003_create_refresh_tokens_table.sql
--
-- Stage 8: Secure Logout & Refresh Token Persistence
--
-- Creates the `refresh_tokens` table for tracking issued refresh tokens,
-- enforcing atomic single-use token rotation, and single-session revocation (logout).
--
-- Architecture & Security Notes:
--   - Token storage: Stores ONLY cryptographic SHA-256 hash (`token_hash`),
--     NEVER the raw JWT token.
--   - Revocation: `is_revoked` boolean flag + `revoked_at` timestamp.
--   - Rotation chain: `replaced_by_token_hash` links old token to its replacement.
--   - Cascading cleanup: References `users(id)` ON DELETE CASCADE.
--   - Performance: Indexed on token_hash (unique), user_id, and expires_at for O(1) lookups.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `is_revoked` TINYINT(1) NOT NULL DEFAULT 0,
  `revoked_at` DATETIME NULL DEFAULT NULL,
  `replaced_by_token_hash` VARCHAR(64) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Primary Key
  CONSTRAINT `pk_refresh_tokens_id` PRIMARY KEY (`id`),

  -- Unique Constraint on Token Hash
  CONSTRAINT `uq_refresh_tokens_token_hash` UNIQUE (`token_hash`),

  -- Foreign Key to Users Table
  CONSTRAINT `fk_refresh_tokens_user_id`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- Secondary Indexes for fast lookups & expiration sweeps
  INDEX `idx_refresh_tokens_user_id` (`user_id`),
  INDEX `idx_refresh_tokens_lookup` (`token_hash`, `is_revoked`, `expires_at`),
  INDEX `idx_refresh_tokens_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
