-- =============================================================================
-- backend/src/db/migrations/001_create_users_table.sql
--
-- Stage 4: Authentication Schema — Users Table
--
-- Creates the core `users` table for the College ERP Authentication Module.
--
-- Roles supported:
--   - ADMIN   : Institutional administrator with privileges to provision and manage accounts.
--   - FACULTY : Teaching and academic staff.
--   - STUDENT : Enrolled student.
--
-- Architecture & Security Notes:
--   - Primary key: BIGINT UNSIGNED for institutional scale and inter-module FK compatibility.
--   - Login identifier: `username` is unique and indexed for O(1) credential lookups.
--   - Email: `email` is unique and indexed for notifications and password recovery.
--   - Password: `password_hash` stores a bcrypt/argon2 hash (never plaintext).
--   - Role: ENUM('ADMIN', 'FACULTY', 'STUDENT') strictly enforced at the database layer.
--   - Account status: `is_active` (1 = active, 0 = suspended/deactivated).
--   - Account lockout: `failed_login_attempts` counter + `locked_until` timestamp.
--   - Password reset: `password_reset_token_hash` + `password_reset_expires_at`.
--   - Auditability: `created_by` references the creating admin with ON DELETE SET NULL.
--   - Timestamps: UTC `created_at` and auto-updating `updated_at`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'FACULTY', 'STUDENT') NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `failed_login_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME NULL DEFAULT NULL,
  `password_reset_token_hash` VARCHAR(255) NULL DEFAULT NULL,
  `password_reset_expires_at` DATETIME NULL DEFAULT NULL,
  `last_login_at` DATETIME NULL DEFAULT NULL,
  `created_by` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Primary Key
  CONSTRAINT `pk_users_id` PRIMARY KEY (`id`),

  -- Uniqueness Constraints
  CONSTRAINT `uq_users_username` UNIQUE (`username`),
  CONSTRAINT `uq_users_email` UNIQUE (`email`),

  -- Foreign Key Constraint (Admin reference, nullable for bootstrap/seed)
  CONSTRAINT `fk_users_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  -- Secondary Indexes for fast lookups & filtering
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_is_active` (`is_active`),
  INDEX `idx_users_password_reset` (`password_reset_token_hash`, `password_reset_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
