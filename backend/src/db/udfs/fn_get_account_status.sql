-- =============================================================================
-- backend/src/db/udfs/fn_get_account_status.sql
--
-- User-Defined Function: fn_get_account_status
-- Determinism: DETERMINISTIC
-- Side-effects: NO SQL
-- Purpose: Evaluates account status ('ACTIVE', 'LOCKED', 'INACTIVE') based on
--          active flag, lockout expiration, and an explicit reference timestamp.
-- Return: Status string ('ACTIVE', 'LOCKED', 'INACTIVE').
-- Deterministic Design: Takes reference timestamp as argument rather than
--                       calling non-deterministic NOW().
-- Security: Utility evaluation only; does not bypass authorization guards.
-- =============================================================================

DROP FUNCTION IF EXISTS `fn_get_account_status`;
CREATE FUNCTION `fn_get_account_status`(
  p_is_active TINYINT,
  p_locked_until DATETIME,
  p_reference_time DATETIME
)
RETURNS VARCHAR(20)
DETERMINISTIC
NO SQL
BEGIN
  IF p_is_active IS NULL OR p_is_active = 0 THEN
    RETURN 'INACTIVE';
  ELSEIF p_locked_until IS NOT NULL AND p_reference_time IS NOT NULL AND p_locked_until > p_reference_time THEN
    RETURN 'LOCKED';
  ELSE
    RETURN 'ACTIVE';
  END IF;
END;
