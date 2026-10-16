# Stage 7 Completion Report: Backend Login API & CAPTCHA Verification

**Module:** College ERP — Authentication Module  
**Workspace:** `d:\DBMSCIE`  
**Status:** Completed & Fully Verified ✅  
**Date:** 2026-10-16  

---

## 1. Overview & Architectural Compliance

In Stage 7, the core user authentication workflow was implemented:
- **Server-generated CAPTCHA challenge**: Endpoint `GET /api/v1/auth/captcha` generates arithmetic challenges with cryptographically secure 64-hex tokens, 3-minute expiration, and HMAC-SHA256 protected storage.
- **Login endpoint**: Endpoint `POST /api/v1/auth/login` verifies single-use CAPTCHAs before credential inspection, queries user credentials via the existing `sp_get_user_by_username` stored procedure, protects against timing attacks, checks account status and temporary lockouts, verifies passwords with `bcryptjs`, atomically maintains login failure counters, and issues role-aware JWT tokens.
- **No plaintext secrets**: Passwords, CAPTCHA answers, reset tokens, and password hashes are never logged or returned to clients.
- **Strict scope limits maintained**: No logout, forgot/reset password, admin user-management endpoints, frontend pages, or default accounts were created. Database schema was unchanged.

---

## 2. API Endpoints Implemented

### 1. `GET /api/v1/auth/captcha`
- **Rate Limit**: 60 requests / 15 minutes per IP.
- **Response**:
  ```json
  {
    "success": true,
    "message": "CAPTCHA challenge generated successfully.",
    "data": {
      "captchaId": "3f8a4e... (64 hex characters)",
      "question": "What is 14 + 7?",
      "expiresInSeconds": 180
    },
    "errors": null
  }
  ```

### 2. `POST /api/v1/auth/login`
- **Rate Limit**: 20 requests / 15 minutes per IP.
- **Request Body**:
  ```json
  {
    "username": "admin_user",
    "password": "SecurePassword123!",
    "captchaId": "3f8a4e... (64 hex characters)",
    "captchaAnswer": "21"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "data": {
      "token": "<JWT access token>",
      "refreshToken": "<JWT refresh token>",
      "tokenType": "Bearer",
      "expiresIn": "8h",
      "user": {
        "id": 21,
        "username": "admin_user",
        "email": "admin@college.edu",
        "role": "ADMIN"
      }
    },
    "errors": null
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation failure (missing/short username/password, missing CAPTCHA, invalid/incorrect/expired/reused CAPTCHA).
  - `401 Unauthorized`: Generic `"Invalid username or password."` (applied identically for non-existent users and incorrect passwords).
  - `403 Forbidden`: `"Account is deactivated. Please contact an administrator."` when `is_active = 0`.
  - `423 Locked`: `"Account is temporarily locked due to multiple failed login attempts. Please try again later."` when `locked_until > NOW()`.
  - `429 Too Many Requests`: Standard rate limit exceeded response.

---

## 3. CAPTCHA Storage, Expiry & Single-Use Security

- **Challenge Generation**: Cryptographically secure 32 random bytes (`crypto.randomBytes(32).toString('hex')`).
- **Answer Storage Protection**: Plaintext answers are never stored in memory. The service computes `crypto.createHmac('sha256', secret).update(normalizedAnswer).digest('hex')` and stores only the resulting hash.
- **Timing-Safe Comparison**: `crypto.timingSafeEqual` is used to compare submitted answers against the stored hash.
- **Single-Use Guarantee**: Challenges are retrieved via `getAndDelete(captchaId)`, ensuring immediate deletion upon verification attempt (preventing reuse/replay attacks regardless of pass/fail).
- **Bounded Storage & DoS Mitigation**: `InMemoryCaptchaStore` is bounded to `MAX_STORE_SIZE = 5000` items with LRU-style eviction of oldest keys when capacity is reached. A background timer sweeps expired challenges every 60 seconds (`timer.unref()` prevents hanging Node processes).
- **TTL**: 180 seconds (3 minutes).

---

## 4. Account Lockout Policy & Atomic Database Updates

- **Threshold**: 5 consecutive failed login attempts (`MAX_FAILED_ATTEMPTS = 5`).
- **Lockout Duration**: 15 minutes (`LOCKOUT_MINUTES = 15`).
- **Atomic Failure Update**:
  ```sql
  UPDATE `users`
  SET
    `failed_login_attempts` = CASE
      WHEN `locked_until` IS NOT NULL AND `locked_until` <= NOW() THEN 1
      ELSE `failed_login_attempts` + 1
    END,
    `locked_until` = CASE
      WHEN `locked_until` IS NOT NULL AND `locked_until` <= NOW() THEN NULL
      WHEN (`failed_login_attempts` + 1) >= 5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE)
      ELSE `locked_until`
    END
  WHERE `id` = ?;
  ```
- **Atomic Success Reset**:
  ```sql
  UPDATE `users`
  SET
    `failed_login_attempts` = 0,
    `locked_until` = NULL,
    `last_login_at` = NOW()
  WHERE `id` = ?;
  ```

---

## 5. Timing Attack Defense & Information Leakage Prevention

- **Dummy Password Hash**: When a requested username does not exist in the database, `authService` executes `comparePassword(password, DUMMY_HASH)` before returning HTTP 401. This equalizes response latency between existing and non-existing accounts, preventing timing-based username enumeration.
- **Response Sanitization**: Internal database fields (`password_hash`, `failed_login_attempts`, `locked_until`, `password_reset_token_hash`, `created_by`) are strictly excluded from response payloads.
- **No Plaintext Logging**: Log entries for authentication only record sanitized user metadata (`userId`, `role`, `ip`, `username`), never passwords, CAPTCHA answers, tokens, or hashes.

---

## 6. Files Created / Modified

| File | Status | Description |
|---|---|---|
| `backend/src/services/captchaService.js` | **Created** | CAPTCHA generation, HMAC-hashed answer storage, single-use verification, bounded in-memory store. |
| `backend/src/middleware/rateLimiter.js` | **Created** | Reusable in-memory rate limiting middleware with RateLimit HTTP headers and 429 response envelope. |
| `backend/src/validations/authValidation.js` | **Created** | Express validation middleware for `POST /api/v1/auth/login`. |
| `backend/src/services/authService.js` | **Created** | Login business logic: CAPTCHA validation, `sp_get_user_by_username` call, dummy hash timing defense, lockout checks, atomic DB updates, JWT issuance. |
| `backend/src/controllers/authController.js` | **Created** | Controller for `getCaptcha` and `login`. |
| `backend/src/routes/authRoutes.js` | **Created** | Routes for `/captcha` and `/login` with rate limiting and validation. |
| `backend/src/routes/index.js` | **Modified** | Mounted `authRoutes` under `/v1/auth`. |
| `backend/scripts/testStage7.js` | **Created** | Automated test suite for Stage 7 (26 tests). |
| `backend/package.json` | **Modified** | Added `test:stage7` script. |
| `shared/contracts/API_CONTRACT.md` | **Modified** | Documented implemented `GET /captcha` and `POST /login` endpoints. |
| `PROJECT_PLAN.md` | **Modified** | Marked Stage 7 complete with verified results. |
| `README.md` | **Modified** | Updated status header and npm scripts table. |
| `stage7_report.md` | **Created** | This report. |

---

## 7. Test Results

### 1. Stage 7 Test Suite (`npm run test:stage7`)
Ran with Node.js built-in test runner (`node:test`):

```text
▶ 1. CAPTCHA Service Unit Tests (6 tests)
  ✔ createChallenge generates 64-hex ID and valid question
  ✔ expected answer is stored as HMAC hash, not plaintext
  ✔ successful verification with correct answer
  ✔ single-use guarantee: challenge cannot be reused
  ✔ rejects incorrect answer and deletes challenge
  ✔ rejects expired challenge
  ✔ store evicts oldest entry when max capacity is reached
▶ 2. Rate Limiter Middleware Tests (1 test)
  ✔ sets rate limit headers and blocks when threshold exceeded
▶ 3. Login Input Validation Tests (6 tests)
  ✔ rejects missing username with HTTP 400
  ✔ rejects short username (< 3 chars) with HTTP 400
  ✔ rejects missing password with HTTP 400
  ✔ rejects short password (< 8 chars) with HTTP 400
  ✔ rejects missing CAPTCHA challenge ID with HTTP 400
  ✔ rejects missing CAPTCHA answer with HTTP 400
▶ 4. CAPTCHA Verification in Login Endpoint (3 tests)
  ✔ rejects invalid or non-existent CAPTCHA challenge ID with HTTP 400
  ✔ rejects incorrect CAPTCHA answer with HTTP 400
  ✔ rejects reused CAPTCHA challenge on second attempt
▶ 5. Authentication & Role-Aware Login Tests (4 tests)
  ✔ ADMIN: successful login returns valid JWT and safe user object
  ✔ FACULTY: successful login with role FACULTY
  ✔ STUDENT: successful login with role STUDENT
  ✔ successful login resets failed_login_attempts to 0 and updates last_login_at
▶ 6. Failed Logins and Account Lockout Policy Tests (4 tests)
  ✔ non-existent username returns generic 401 (timing mitigated)
  ✔ wrong password returns generic 401 and increments counter
  ✔ reaching 5 failed attempts locks the account (HTTP 423)
  ✔ deactivated account (is_active = 0) returns HTTP 403
▶ 7. Health Check Regression (1 test)
  ✔ GET /api/health returns HTTP 200 with database connected

ℹ tests 26 | suites 7 | pass 26 | fail 0 | duration_ms ~1400ms
```

### 2. Stage 6 Regression (`npm run test:stage6`)
- **Result:** **40/40 tests passed** (0 failures).

### 3. Stage 5 Regression (`npm run test:stage5`)
- **Result:** **52/52 assertions passed** (0 failures).

### 4. Database Schema & Infrastructure
- Clean state confirmed: All temporary test user accounts (`test_admin_*`, `test_fac_*`, `test_stu_*`, `lockout_user_*`) were safely purged.
- Health check `GET /api/health` confirmed operational with `database.status: "connected"`.

---

## 8. Limitations & Integration Readiness

1. **In-Memory CAPTCHA & Rate Limiting Storage**:
   - Current implementation stores active CAPTCHA challenges and rate limiter counters in an in-memory `Map` within the single Node.js process.
   - *Limitation*: If scaled horizontally across multiple Node.js instances behind a load balancer without sticky sessions, a challenge created on Instance A would not be found on Instance B.
   - *Integration-ready design*: `InMemoryCaptchaStore` implements a clean `getAndDelete`, `set`, and `purgeExpired` interface. For a multi-node cluster, this store can be swapped with a Redis client (e.g. `ioredis`) using Redis `SET key value EX 180` and atomic `GETDEL key` operations without modifying `authService` or `authController`.
2. **Third-Party CAPTCHA Providers**:
   - The current server-generated arithmetic challenge is self-contained and avoids external network latency or vendor lock-in. If reCAPTCHA or hCaptcha is integrated in the future, the verification step in `authService` can easily chain or replace `captchaService.verifyChallenge`.
