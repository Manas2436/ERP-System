-- =============================================================================
-- backend/src/db/udfs/fn_normalize_role.sql
--
-- User-Defined Function: fn_normalize_role
-- Determinism: DETERMINISTIC
-- Side-effects: NO SQL
-- Purpose: Normalizes input role strings by trimming whitespace and converting
--          to uppercase. Validates against allowed roles ('ADMIN', 'FACULTY', 'STUDENT').
-- Return: Canonical role string ('ADMIN', 'FACULTY', 'STUDENT') or NULL if invalid.
-- Security: Read-only utility. Not a replacement for server-side authorization checks.
-- =============================================================================

DROP FUNCTION IF EXISTS `fn_normalize_role`;
CREATE FUNCTION `fn_normalize_role`(p_role VARCHAR(50))
RETURNS VARCHAR(20)
DETERMINISTIC
NO SQL
BEGIN
  DECLARE v_clean VARCHAR(50);
  IF p_role IS NULL THEN
    RETURN NULL;
  END IF;

  SET v_clean = UPPER(TRIM(p_role));

  IF v_clean IN ('ADMIN', 'FACULTY', 'STUDENT') THEN
    RETURN v_clean;
  ELSE
    RETURN NULL;
  END IF;
END;
