-- =============================================================================
-- backend/src/db/udfs/fn_format_role_label.sql
--
-- User-Defined Function: fn_format_role_label
-- Determinism: DETERMINISTIC
-- Side-effects: NO SQL
-- Purpose: Translates canonical database role values ('ADMIN', 'FACULTY', 'STUDENT')
--          into user-friendly display labels for UI presentation.
-- Return: Human-readable string or 'Unknown' for unrecognized roles.
-- Security: Read-only presentation helper.
-- =============================================================================

DROP FUNCTION IF EXISTS `fn_format_role_label`;
CREATE FUNCTION `fn_format_role_label`(p_role VARCHAR(20))
RETURNS VARCHAR(50)
DETERMINISTIC
NO SQL
BEGIN
  IF p_role IS NULL THEN
    RETURN 'Unknown';
  END IF;

  CASE UPPER(TRIM(p_role))
    WHEN 'ADMIN' THEN RETURN 'Administrator';
    WHEN 'FACULTY' THEN RETURN 'Faculty Member';
    WHEN 'STUDENT' THEN RETURN 'Enrolled Student';
    ELSE RETURN 'Unknown';
  END CASE;
END;
