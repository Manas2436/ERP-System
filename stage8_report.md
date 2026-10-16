# Stage 8 Completion Report: Secure Logout & Refresh Token Lifecycle

**Module:** College ERP — Authentication Module  
**Workspace:** `d:\DBMSCIE`  
**Status:** Completed & Fully Verified ✅  
**Date:** 2026-10-16  

---

## 1. Overview & Architectural Compliance

Stage 8 implements the complete backend token lifecycle management for the Authentication Module:
- **Dedicated Refresh Token Persistence**: Migration `003_create_refresh_tokens_table.sql` added the `refresh_tokens` table.
- **Cryptographic Hashing**: Raw JWT refresh tokens are never persisted in the database; only their SHA-256 cryptographic hashes (`token_hash`) are stored.
- **Atomic Token Rotation**: Endpoint `POST /api/v1/auth/refresh` rotates refresh tokens atomically within a database transaction using row-level locking (`SELECT ... FOR UPDATE`), preventing race conditions and replay attacks.
- **Revocation & Logout**: Endpoint `POST /api/v1/auth/logout` revokes the supplied refresh token in the database idempotently.
- **Access Token vs. Refresh Token Distinction**: Access tokens and refresh tokens carry distinct `type` claims (`'access'` vs. `'refresh'`). Access tokens presented to `/refresh` or `/logout` are strictly rejected.
- **Access Token Expiration Architecture Note**: Stateless JWT access tokens remain valid until their natural expiration time (`JWT_EXPIRES_IN`, default 8h). Logout revokes the session's refresh token so that no replacement access tokens can be obtained.
- **Strict Scope Boundaries**: No frontend code, no admin management endpoints, no public signup, and no hardcoded credentials were added.

---

## 2. Database Migration & Schema Details

### Migration File: `backend/src/db/migrations/003_create_refresh_tokens_table.sql`
- **Tracking**: Recorded in `schema_migrations` (`id: 4`, `migration_name: 003_create_refresh_tokens_table.sql`).
- **Table Definition**:
  ```sql
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

    CONSTRAINT `pk_refresh_tokens_id` PRIMARY KEY (`id`),
    CONSTRAINT `uq_refresh_tokens_token_hash` UNIQUE (`token_hash`),
    CONSTRAINT `fk_refresh_tokens_user_id`
      FOREIGN KEY (`user_id`)
      REFERENCES `users` (`id`)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    INDEX `idx_refresh_tokens_user_id` (`user_id`),
    INDEX `idx_refresh_tokens_lookup` (`token_hash`, `is_revoked`, `expires_at`),
    INDEX `idx_refresh_tokens_expires_at` (`expires_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  ```
- **Integrity**: `ON DELETE CASCADE` automatically removes tokens when a user account is deleted. Unique constraint on `token_hash` prevents duplicate records.

---

## 3. Token Lifecycle & Rotation Architecture

1. **Uniqueness via `jti`**: `signRefreshToken` in `backend/src/utils/jwt.js` now includes a cryptographically random `jti` claim (`crypto.randomBytes(16).toString('hex')`). This guarantees that every issued refresh token is globally unique, even if generated within the exact same second for the same user.
2. **Persistence on Login**: When `authService.login()` authenticates a user, it generates access and refresh tokens, hashes the refresh token with SHA-256, and stores it in `refresh_tokens` with expiration timestamp.
3. **Atomic Single-Use Rotation Chain**:
   - `authService.refresh()` opens a database transaction and locks the token row with `SELECT ... FOR UPDATE`.
   - Checks if the token is already revoked (`is_revoked === 1`). If so, a replay attack is detected and the request is rejected with HTTP 401.
   - Checks if the token has expired in the database (`expires_at <= NOW()`).
   - Checks current user existence, active status (`is_active = 1`), and temporary lock status (`locked_until`).
   - Generates replacement access token and new refresh token.
   - Marks the old refresh token as revoked (`is_revoked = 1, revoked_at = NOW()`) and sets `replaced_by_token_hash` to link to the new token.
   - Inserts the new refresh token record.
   - Commits transaction atomically.
4. **Race Condition Defense**:
   - Multiple concurrent requests presenting the same refresh token are serialized by the row-level lock (`FOR UPDATE`).
   - The first request to acquire the lock revokes the token and commits.
   - Subsequent concurrent requests acquire the lock, read `is_revoked = 1`, and are immediately rejected with HTTP 401 (`"Refresh token has been revoked."`).

---

## 4. Revocation & Logout Design

- **Endpoint**: `POST /api/v1/auth/logout`.
- **Mechanism**: Calculates `SHA-256(refreshToken)` and marks `is_revoked = 1, revoked_at = NOW()` in `refresh_tokens`.
- **Idempotence**: Repeated logout calls with the same token succeed safely (HTTP 200), preventing application errors on client side.
- **Access Token Invalidation Policy**:
  > **Security Note:** In this architecture, stateless JWT access tokens remain valid until their expiration timestamp (`JWT_EXPIRES_IN`, default 8 hours). Logout immediately invalidates the session's refresh token so that no further access tokens can be issued once the active token expires.

---

## 5. API Endpoints Implemented

### 1. `POST /api/v1/auth/refresh` (and alias `/api/v1/auth/refresh-token`)
- **Rate Limit**: 30 requests / 15 minutes per IP.
- **Request Body**:
  ```json
  {
    "refreshToken": "<JWT refresh token string>"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Tokens refreshed successfully.",
    "data": {
      "token": "<new JWT access token>",
      "refreshToken": "<new replacement JWT refresh token>",
      "tokenType": "Bearer",
      "expiresIn": "8h",
      "user": {
        "id": 44,
        "username": "faculty_user",
        "email": "faculty@college.edu",
        "role": "FACULTY"
      }
    },
    "errors": null
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing or non-string `refreshToken`.
  - `401 Unauthorized`: Malformed, tampered, expired, unrecognized, or already-revoked token. Also returned if access token was passed.
  - `403 Forbidden`: Account deactivated (`is_active = 0`).
  - `423 Locked`: Account temporarily locked.

### 2. `POST /api/v1/auth/logout`
- **Rate Limit**: 30 requests / 15 minutes per IP.
- **Request Body**:
  ```json
  {
    "refreshToken": "<JWT refresh token string>"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Logout successful. Session revoked.",
    "data": null,
    "errors": null
  }
  ```

---

## 6. Files Created / Modified

| File | Status | Description |
|---|---|---|
| `backend/src/db/migrations/003_create_refresh_tokens_table.sql` | **Created** | Migration creating `refresh_tokens` table with indexes, constraints, and cascading FK. |
| `backend/src/utils/jwt.js` | **Modified** | Added crypto `jti` claim to `signRefreshToken` for global uniqueness per issuance. |
| `backend/src/services/authService.js` | **Modified** | Persisted refresh token in `login()`; implemented `refresh()` with transaction & row lock; implemented `logout()`. |
| `backend/src/validations/authValidation.js` | **Modified** | Added `validateRefresh` and `validateLogout` validation middlewares. |
| `backend/src/controllers/authController.js` | **Modified** | Added `refresh` and `logout` controllers. |
| `backend/src/routes/authRoutes.js` | **Modified** | Added `/refresh`, `/refresh-token`, and `/logout` routes with rate limiters. |
| `backend/scripts/verifySchema.js` | **Modified** | Added `refresh_tokens` table and index verification inspections. |
| `backend/scripts/testStage8.js` | **Created** | Automated test suite with 19 comprehensive test cases. |
| `backend/package.json` | **Modified** | Added `test:stage8` script. |
| `shared/contracts/API_CONTRACT.md` | **Modified** | Documented `/refresh` and `/logout` request/response contracts and access token validity notice. |
| `PROJECT_PLAN.md` | **Modified** | Marked Stage 8 complete and updated stage status. |
| `README.md` | **Modified** | Updated status line to Stage 8 verified and added `test:stage8` to scripts table. |
| `stage8_report.md` | **Created** | This report. |

---

## 7. Test Results

### 1. Stage 8 Test Suite (`npm run test:stage8`)
Executed via Node.js built-in test runner (`node:test`):

```text
▶ 1. Input Validation for /refresh and /logout (4 tests)
  ✔ POST /refresh rejects missing refreshToken with HTTP 400
  ✔ POST /refresh rejects empty string refreshToken with HTTP 400
  ✔ POST /logout rejects missing refreshToken with HTTP 400
  ✔ POST /logout rejects non-string refreshToken with HTTP 400
▶ 2. Token Type & Integrity Validation (5 tests)
  ✔ POST /refresh rejects access token presented as refresh token with HTTP 401
  ✔ POST /logout rejects access token presented as refresh token with HTTP 401
  ✔ POST /refresh rejects malformed / tampered token with HTTP 401
  ✔ POST /refresh rejects expired refresh token with HTTP 401
  ✔ POST /refresh rejects unrecognized token (valid JWT not in DB) with HTTP 401
▶ 3. Successful Refresh Token Rotation Tests (2 tests)
  ✔ rotates refresh token and issues replacement tokens
  ✔ POST /refresh-token alias route works identically
▶ 4. Replay Attack & Old-Token Rejection Tests (1 test)
  ✔ reusing an old already-rotated refresh token fails with HTTP 401
▶ 5. Concurrent Refresh Attempts Tests (1 test)
  ✔ exactly ONE concurrent request succeeds; all others are rejected
▶ 6. Logout and Repeated Logout Tests (2 tests)
  ✔ POST /logout revokes the token and prevents further refresh
  ✔ repeated logout with the same token is idempotent and succeeds safely
▶ 7. Inactive and Deleted User Handling (2 tests)
  ✔ deactivated account rejects refresh with HTTP 403
  ✔ deleted account rejects refresh with HTTP 401
▶ 8. Security Invariants: No Sensitive Leakage in /refresh (1 test)
  ✔ refresh response strictly excludes password_hash, token_hash, and attempt counters
▶ 9. Health Check Regression (1 test)
  ✔ GET /api/health returns HTTP 200 with database connected

ℹ tests 19 | suites 9 | pass 19 | fail 0 | duration_ms ~1440ms
```

### 2. Regression Suites
- **Stage 7 Tests (`npm run test:stage7`)**: **26/26 passed** ✅
- **Stage 6 Tests (`npm run test:stage6`)**: **40/40 passed** ✅
- **Stage 5 Tests (`npm run test:stage5`)**: **52/52 passed** ✅
- **Database Schema (`npm run verify:schema`)**: 4 applied migrations, tables `users`, `user_audit_logs`, `refresh_tokens`, 2 views, 4 stored procedures, 3 UDFs, 1 trigger verified.
- **Database Health**: `GET /api/health` confirmed `database.status: "connected"` (HTTP 200).

---

## 8. Limitations & Unresolved Issues

1. **Access Token Revocation vs. Performance**:
   - Access tokens are stateless and verified via HMAC signature without querying the database.
   - Consequently, access tokens remain valid until their expiration window ends.
   - *Mitigation for Future Stages*: Access token expiration can be shortened (e.g. 15 minutes) with seamless client-side background refreshes using the secure refresh token rotation mechanism.
2. **Expired Token Cleanup Job**:
   - Expired revoked tokens accumulate in `refresh_tokens` over time.
   - *Recommended Future Task*: A scheduled database event or cron job (`DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL 30 DAY`) can be introduced in a future maintenance stage to purge expired session history.
