-- Non-destructive upgrade for an existing ERP database.
-- Safe to apply more than once; does not modify app_user identities or links.
-- Also restores the refresh-token persistence table if an older database is
-- missing it, which is required for rotation and logout invalidation.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  refresh_token_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  is_revoked TINYINT(1) NOT NULL DEFAULT 0,
  revoked_at DATETIME NULL,
  replaced_by_token_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_refresh_tokens PRIMARY KEY (refresh_token_id),
  CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id)
    REFERENCES app_user (user_id) ON DELETE CASCADE,
  INDEX idx_refresh_tokens_user_active (user_id, is_revoked, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  reset_token_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_password_reset_tokens PRIMARY KEY (reset_token_id),
  CONSTRAINT uq_password_reset_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id)
    REFERENCES app_user (user_id) ON DELETE CASCADE,
  INDEX idx_password_reset_user_active (user_id, consumed_at, expires_at)
) ENGINE=InnoDB;
