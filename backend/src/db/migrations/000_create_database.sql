-- =============================================================================
-- backend/src/db/migrations/000_create_database.sql
--
-- Stage 3: Create the college_erp database if it does not already exist.
--
-- Run this file ONCE using a MySQL user with CREATE privilege:
--   "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < 000_create_database.sql
--
-- Or paste into MySQL Workbench → Query window → Execute.
--
-- SAFETY NOTES:
--  - Uses IF NOT EXISTS — safe to run multiple times.
--  - Does NOT drop, reset, or modify any existing database.
--  - Does NOT create any tables (that happens in migration 001+).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS college_erp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Confirm creation
SELECT
  SCHEMA_NAME      AS `database`,
  DEFAULT_CHARACTER_SET_NAME AS `charset`,
  DEFAULT_COLLATION_NAME     AS `collation`
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'college_erp';
