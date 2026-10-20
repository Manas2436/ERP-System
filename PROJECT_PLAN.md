# College ERP — Authentication Module: Project Plan

> **Legend:** `[ ]` Not started · `[/]` In progress · `[x]` Completed  
> **Current Stage:** Stage 16 — Documentation & Final Review (Completed ✅ — Release v1.0.0)

---

## Stage 1 — Scaffold & Planning

- [x] Inspect workspace — confirm it is empty
- [x] Verify Node.js, npm, MySQL, Git versions (document actuals)
- [x] Define high-level folder structure (frontend + backend + shared)
- [x] Create `README.md` — module purpose, stack, architecture
- [x] Create `PROJECT_PLAN.md` (this file) — staged checklist
- [x] Create `.gitignore` — exclude `.env`, `node_modules`, build artifacts
- [x] Create `backend/.env.example` — safe environment variable template
- [x] Create `frontend/.env.example` — safe environment variable template
- [x] Create `shared/contracts/API_CONTRACT.md` — inter-module integration notes
- [x] Create placeholder `.gitkeep` files to preserve empty directories in Git
- [ ] **BLOCKER (pending user action):** Add MySQL binary directory to system PATH
      `C:\Program Files\MySQL\MySQL Server 8.0\bin`
      _(Not required for Stage 2 — Express runs without DB. Required for Stage 3 DB schema work.)_

---

## Stage 2 — Backend Setup (Express + MySQL Connection)

- [x] Initialize `backend/package.json` — `college-erp-auth-backend v0.1.0`
- [x] Install production dependencies:
      `express@5.3.0`, `dotenv@18.0.7`, `helmet@8.3.0`, `cors@2.8.6`
      _(mysql2, bcryptjs, jsonwebtoken, joi deferred to their respective stages)_
- [x] Install dev dependency: `nodemon@3.1.14`
      ⚠️ Note: nodemon pulls in `braces` (RegEx DoS, dev-only, not in production build)
- [x] Add npm scripts: `start` (node server.js), `dev` (nodemon server.js)
- [x] Create `backend/src/config/env.js` — typed config loader with production-guard
- [x] Create `backend/src/app.js` — Express app factory (Helmet, CORS, JSON parser, routes)
- [x] Create `backend/src/utils/responseBuilder.js` — standard JSON envelope helper
- [x] Create `backend/src/utils/logger.js` — dev-colour / production-JSON logger
- [x] Create `backend/src/middleware/errorHandler.js` — centralized error handler (no stack traces in prod)
- [x] Create `backend/src/middleware/notFound.js` — 404 JSON handler
- [x] Create `backend/src/routes/healthRoutes.js` — `GET /api/health` (no DB claim)
- [x] Create `backend/src/routes/index.js` — root API router with versioning placeholders
- [x] Create `backend/server.js` — HTTP server entry point with graceful shutdown
- [x] Create `backend/.env` — local placeholder file (not committed)
- [x] Verify `.env` excluded by `.gitignore` ✅
- [x] Verify backend starts cleanly: `node server.js` → port 5000, INFO logged
- [x] **Verified** `GET /api/health` → HTTP 200, correct JSON envelope
- [x] **Verified** unknown route → HTTP 404, JSON envelope
- [x] **Verified** malformed JSON body → HTTP 400, sanitized message
- [x] MySQL connection pool (`mysql2@3.12.0`) installed — deferred from Stage 2, completed in Stage 3
- [x] Add `setup:db` npm script — `node scripts/setupDb.js`

---

## Stage 3 — MySQL Connection Pool & Database Setup

- [x] Verify MySQL service status: `MySQL80` — **Running** (Automatic startup)
- [x] Verify MySQL version: **8.0.46** (Community Server, Win64)
- [x] Install `mysql2@3.12.0` (includes `mysql2/promise` for async pool)
- [x] Create `backend/src/config/db.js` — reusable pool (keepAlive, UTC timezone, strict mode)
- [x] Create `backend/src/services/dbHealthService.js` — SELECT 1 ping, safe error codes only
- [x] Update `backend/src/routes/healthRoutes.js` — reports `api` and `database` separately
- [x] Update `backend/server.js` — closes pool cleanly on SIGTERM/SIGINT
- [x] Update `backend/.env.example` — DB_NAME=college_erp with inline documentation
- [x] Update `backend/.env` — DB_NAME=college_erp (local placeholder, git-ignored)
- [x] Create `backend/src/db/migrations/000_create_database.sql` — idempotent DB creation SQL
- [x] Create `backend/scripts/setupDb.js` — one-time DB creation script (safe, no destructive ops)
- [x] Add `setup:db` npm script to `package.json`
- [x] **Verified**: server starts cleanly with placeholder credentials — no crash
- [x] **Verified**: `GET /api/health` returns `database.status = disconnected / configuration_missing`
      (correct honest response while MySQL password is not yet configured)
- [x] Configured MySQL credentials in local `backend/.env`
- [x] Executed `npm run setup:db` — created `college_erp` database (`utf8mb4` / `utf8mb4_unicode_ci`)
- [x] **Verified**: `GET /api/health` returns `database.status = connected` (live `SELECT 1` ping succeeded)

---

## Stage 3b — Frontend Setup (React + Tailwind CSS)
 
- [x] Scaffold React app inside `frontend/` using Vite (`college-erp-auth-frontend`)
- [x] Install and configure Tailwind CSS (PostCSS config, `tailwind.config.js`)
- [x] Configure `frontend/.env.example` (API base URL `VITE_API_BASE_URL`)
- [x] Install Axios for API communication with interceptors and error normalization
- [x] Create `frontend/src/services/apiClient.js` — Axios instance with auth tokens & refresh flow
- [x] Create `frontend/src/context/AuthContext.jsx` — AuthProvider with login, logout, user session state
- [x] Create `frontend/src/routes/AppRouter.jsx` — React Router v6 with route guards and role routing
- [x] Verify frontend production build and test runner (`npm run build` & `npm test`)

---

## Stage 4 — Database Schema Design
 
- [x] Design `users` table:
      `id` (BIGINT UNSIGNED, PK, AUTO_INCREMENT), `username` (VARCHAR(50), UNIQUE),
      `email` (VARCHAR(100), UNIQUE), `password_hash` (VARCHAR(255)),
      `role` (ENUM: ADMIN/FACULTY/STUDENT), `is_active` (TINYINT(1)),
      `failed_login_attempts` (INT UNSIGNED), `locked_until` (DATETIME),
      `password_reset_token_hash` (VARCHAR(255)), `password_reset_expires_at` (DATETIME),
      `last_login_at` (DATETIME), `created_by` (BIGINT UNSIGNED, FK -> users.id),
      `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP)
- [x] Write `backend/src/db/migrations/001_create_users_table.sql`
- [x] Implement safe migration runner `backend/scripts/migrate.js` with `schema_migrations` tracking
- [x] Create documented development seed template `backend/src/db/seeds/001_seed_initial_admin.example.sql` and `seeds/README.md` (no hardcoded passwords)
- [x] Execute migration via `npm run migrate` against `college_erp`
- [x] Create and run `backend/scripts/verifySchema.js` (`npm run verify:schema`) to inspect table columns, keys, and constraints
- [x] Verify API health check `GET /api/health` continues to report connected database status

---

## Stage 5 — Stored Procedures, Triggers, UDFs, and Views
 
- [x] **Audit Table:** `user_audit_logs` — dedicated audit trail table with institutional retention notes
- [x] **Stored Procedure:** `sp_create_user` — safely provisions user with required validation & role enforcement (relies on DB uniqueness constraints)
- [x] **Stored Procedure:** `sp_update_user_status` — activates / deactivates account with validation and existence checks
- [x] **Stored Procedure:** `sp_update_user_role` — updates user role with normalization and validation
- [x] **Stored Procedure:** `sp_get_user_by_username` — internal credential lookup by username for auth service
- [x] **Trigger:** `trg_users_before_insert` — evaluated and safely omitted (username uniqueness is enforced by index `uq_users_username`; defaults handled by column definitions; avoids redundant triggers)
- [x] **Trigger:** `trg_users_after_update` — audits status and role transitions into `user_audit_logs` without recursion or secret leakage
- [x] **UDFs:** Deterministic, read-only utilities implemented and verified:
-     `fn_normalize_role(p_role)` — returns canonical role ENUM string or NULL
-     `fn_format_role_label(p_role)` — returns user-friendly UI presentation label
-     `fn_get_account_status(p_is_active, p_locked_until, p_reference_time)` — evaluates account state
-     _(Security note: Token verification intentionally excluded from UDFs to prevent bypassing application-layer security)_
- [x] **View:** `vw_user_summary` — administrative user overview exposing metadata; strictly excludes `password_hash` and token secrets
- [x] **View:** `vw_active_users` — filtered directory for active accounts (`is_active = 1`); strictly excludes secrets
- [x] Write corresponding `.sql` files under `backend/src/db/` subdirectories (`migrations/`, `views/`, `procedures/`, `triggers/`, `udfs/`)
- [x] Execute migration `002_create_auth_views_procedures_triggers_udfs.sql` via `npm run migrate`
- [x] Update `backend/scripts/verifySchema.js` to inspect tables, views, procedures, UDFs, triggers, and migrations
- [x] Create and run automated test suite `backend/scripts/testStage5.js` (`npm run test:stage5`) — all 52 assertions passed with complete cleanup

---

## Stage 6 — Backend Security Foundation (Password, JWT, Middleware)

> **Note:** The original Stage 6 plan was for Admin API routes. This stage was
> reprioritized to implement the reusable security foundation (password utils,
> JWT utils, verifyToken, requireRole) that all future API routes depend on.
> Admin API routes will be built in Stage 7 (renamed accordingly).

- [x] Install `jsonwebtoken@9.0.2` and `bcryptjs@3.0.2`
- [x] Add `BCRYPT_ROUNDS` to `env.js` (clamped 10–14, production default 12)
- [x] Update `backend/.env.example` with `BCRYPT_ROUNDS` and improved JWT_SECRET comment
- [x] **Password utility** `backend/src/utils/password.js`:
      `hashPassword(plaintext)` and `comparePassword(plaintext, hash)` — async, never logs plaintext
- [x] **JWT utility** `backend/src/utils/jwt.js`:
      `signAccessToken({ id, role })`, `signRefreshToken({ id })`, `verifyAccessToken(token)`, `verifyRefreshToken(token)`
      — HS256, type-discriminated ('access'/'refresh'), no PII in claims
      — Production startup fails on missing or short secret
- [x] **Middleware** `backend/src/middleware/verifyToken.js`:
      Extracts and verifies Bearer token; attaches `req.user = { id, role }`
      Returns 401 with typed messages (missing / expired / invalid) without leaking internals
- [x] **Middleware** `backend/src/middleware/requireRole.js`:
      Factory enforcing RBAC for ADMIN/FACULTY/STUDENT; throws at registration time on invalid role;
      Returns 401 if verifyToken was skipped, 403 for insufficient role
- [x] Automated test suite `backend/scripts/testStage6.js` (`npm run test:stage6`) using Node built-in test runner
      — **40/40 tests passed**: env config, password hash/compare, JWT sign/verify, verifyToken (all paths), requireRole (all paths), GET /api/health regression
- [x] Regression: Stage 5 test suite `npm run test:stage5` still passes — **52/52 assertions**

---

## Stage 7 — Login API + CAPTCHA Verification

- [x] Create `backend/src/services/captchaService.js`:
      - Cryptographically secure 64-hex challenge IDs (`crypto.randomBytes(32)`)
      - Single-use verification with immediate challenge consumption
      - HMAC-SHA256 hashed answer storage (no plaintext answers stored)
      - Bounded in-memory store (max 5,000 items) + periodic sweep of expired entries
      - 3-minute short expiration window
- [x] Create `backend/src/middleware/rateLimiter.js`:
      - Sliding window in-memory limiter with RateLimit headers & 429 response
      - Applied to `/api/v1/auth/captcha` and `/api/v1/auth/login`
- [x] Create `backend/src/validations/authValidation.js`:
      - Validates username (3-50 chars), password (8-128 chars), captchaId, and captchaAnswer
- [x] Create `backend/src/services/authService.js`:
      - Single-use CAPTCHA verification prior to DB/crypto access
      - User credential lookup via stored procedure `sp_get_user_by_username`
      - Timing-attack defense via dummy bcrypt compare for non-existent users
      - Generic authentication error ("Invalid username or password.")
      - Account active status check (`is_active = 1`)
      - Account lockout policy: 5 failed attempts -> 15 min lock (`locked_until`)
      - Atomic DB counter updates for failures and lockout expiry
      - Reset `failed_login_attempts` to 0 and update `last_login_at` on success
      - Safe user payload (never leaks hashes, reset tokens, or attempt counters)
- [x] Create `backend/src/controllers/authController.js` (`getCaptcha`, `login`)
- [x] Create `backend/src/routes/authRoutes.js` and mount at `/api/v1/auth` in `routes/index.js`
- [x] Automated test suite `backend/scripts/testStage7.js` (`npm run test:stage7`):
      - **26/26 tests passed**: CAPTCHA unit tests, rate limiter, validation, single-use/expired/incorrect CAPTCHA, ADMIN/FACULTY/STUDENT role logins, JWT verification with verifyToken & requireRole, no internal field leakage, timing defense, lockout triggering at 5 attempts, counter reset on success, 403 on deactivated account, 423 on locked account, health check regression
- [x] Regression: Stage 6 suite `npm run test:stage6` still passes — **40/40 tests**
- [x] Regression: Stage 5 suite `npm run test:stage5` still passes — **52/52 assertions**

---

## Stage 8 — Logout & Refresh Token Lifecycle (Backend)

- [x] Create migration `003_create_refresh_tokens_table.sql`:
      - Dedicated `refresh_tokens` table storing SHA-256 token hashes, `user_id`, `expires_at`, `is_revoked`, `revoked_at`, `replaced_by_token_hash`
      - Foreign key referencing `users(id)` ON DELETE CASCADE
      - Indexes on `token_hash` (unique), `user_id`, and `expires_at`
- [x] Apply migration via `npm run migrate` and verify via `npm run verify:schema`
- [x] Update `backend/src/utils/jwt.js`:
      - Include cryptographically secure `jti` in refresh token payload to guarantee uniqueness per issuance
- [x] Update `backend/src/services/authService.js`:
      - Persist refresh token hash on login (`sp_get_user_by_username` -> hash -> insert)
      - Implement `refresh({ refreshToken, clientIp })` with transaction & row-level locking (`SELECT ... FOR UPDATE`)
      - Detect replay attacks (reject revoked tokens with 401)
      - Reject expired tokens (401) and access tokens (401)
      - Enforce active account status (`is_active = 1` -> 403 on deactivated) and check lock status
      - Atomic single-use rotation: revoke old token and record `replaced_by_token_hash`, issue and insert new token
      - Implement `logout({ refreshToken, clientIp })`: idempotent revocation in DB
- [x] Update `backend/src/validations/authValidation.js` (`validateRefresh`, `validateLogout`)
- [x] Update `backend/src/controllers/authController.js` (`refresh`, `logout`)
- [x] Update `backend/src/routes/authRoutes.js` (`POST /api/v1/auth/refresh`, `POST /api/v1/auth/refresh-token`, `POST /api/v1/auth/logout`)
- [x] Automated test suite `backend/scripts/testStage8.js` (`npm run test:stage8`):
      - **19/19 tests passed**: input validation, wrong token type rejection (access token rejected as refresh token), malformed/expired/unrecognized token rejection, successful atomic token rotation with replacement linkage, replay rejection, race condition defense under concurrent requests (at most one succeeds), logout and repeated logout idempotence, deactivated/deleted user handling, zero sensitive leakage, and health check regression
- [x] Regression: Stage 7 suite `npm run test:stage7` still passes — **26/26 tests**
- [x] Regression: Stage 6 suite `npm run test:stage6` still passes — **40/40 tests**
- [x] Regression: Stage 5 suite `npm run test:stage5` still passes — **52/52 assertions**

---

## Stage 9 — Forgot Password & Secure Reset Password (Backend)

> **Note:** Aligned with backend progression milestones (Stage 6: Security Foundation, Stage 7: Login, Stage 8: Refresh/Logout, Stage 9: Forgot & Reset Password).

- [x] Implement `POST /api/v1/auth/forgot-password`:
      - Accept validated account identifier (email or username)
      - Anti-enumeration defense: return identical generic response for existing and nonexistent accounts
      - Timing-attack defense via dummy cryptographic hash execution for nonexistent accounts
      - Cryptographically secure 256-bit token generation (`crypto.randomBytes(32)`)
      - Store only SHA-256 token hash (`password_reset_token_hash`) and expiration timestamp in `users` table
      - 15-minute expiration window (`PASSWORD_RESET_TOKEN_EXPIRY_MINUTES`)
      - Rate limiting (10 requests / 15 minutes per IP)
      - Zero sensitive logging: never log tokens, passwords, or sensitive account details
      - Development-only testing mechanism (`getDevResetToken()`) that cannot expose tokens in production responses
- [x] Implement `POST /api/v1/auth/reset-password`:
      - Input validation for reset token (16-255 chars) and password policy (8-128 chars)
      - Hash new password using existing bcryptjs utility (`hashPassword`)
      - Atomic transaction with row-level locking (`SELECT ... FOR UPDATE`): verify token hash and expiry, update password, clear token and lockout in single transaction
      - Concurrency protection: serialize concurrent requests with row-level locking so exactly one succeeds
      - Session revocation: revoke all active refresh-token sessions for the user in `refresh_tokens` table
      - Document that existing stateless JWT access tokens remain valid until natural expiry unless application-layer token revocation is implemented
      - Rate limiting (15 attempts / 15 minutes per IP)
- [x] Automated test suite `backend/scripts/testStage9.js` (`npm run test:stage9`):
      - **35/35 tests passed**: input validation for forgot-password and reset-password, generic response anti-enumeration for existing and nonexistent accounts, hashed-only token storage, password policy enforcement, successful reset and subsequent login across roles (ADMIN, FACULTY, STUDENT), single-use and reuse prevention, expired token rejection, tampered/invalid token rejection, concurrent race condition defense, refresh-token session revocation, lockout clearing, deactivated account handling, rate limiting headers and 429 response, and full regression checks.
- [x] Regression: Stage 8 suite `npm run test:stage8` still passes — **19/19 tests**
- [x] Regression: Stage 7 suite `npm run test:stage7` still passes — **26/26 tests**
- [x] Regression: Stage 6 suite `npm run test:stage6` still passes — **40/40 tests**
- [x] Regression: Stage 5 suite `npm run test:stage5` still passes — **52/52 assertions**
- [x] Schema & Database Health: `npm run verify:schema` and `GET /api/health` confirmed connected with clean tables.

---

## Stage 10 — Frontend Setup & Authentication UI (Completed ✅)

- [x] Configure React 18 + Vite with Tailwind CSS, Lucide icons, and testing utilities
- [x] Create Axios API Client (`frontend/src/services/apiClient.js`) with Bearer token header injection and 401 refresh token interceptor
- [x] Create Auth Service (`frontend/src/services/authService.js`) wrapping backend REST endpoints (`/captcha`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password`)
- [x] Create centralized Auth Context (`frontend/src/context/AuthContext.jsx`) managing JWT tokens, user metadata, and localStorage synchronization
- [x] Build reusable common UI components: `Alert.jsx`, `Button.jsx`, `Input.jsx`, `Navbar.jsx`, and `CaptchaBox.jsx`
- [x] Build Responsive Login Page (`LoginPage.jsx`):
      - Username or institutional email, password, and CAPTCHA challenge widget
      - Real-time client validation and server error handling (400, 401, 403, 423, 429)
      - Explicit banner noting that public self-registration is disabled
      - Server-issued role navigation to appropriate dashboard
- [x] Build Forgot Password Page (`ForgotPasswordPage.jsx`):
      - Anti-enumeration generic response handling
      - Rate-limiting (429) visual feedback
- [x] Build Reset Password Page (`ResetPasswordPage.jsx`):
      - Query parameter (`?token=...`) auto-population with manual token entry fallback
      - Password confirmation and length policy validation
- [x] Build Route Guards:
      - `ProtectedRoute.jsx`: validates active session and verifies server-issued role against `allowedRoles`
      - `PublicOnlyRoute.jsx`: redirects already-authenticated sessions directly to their role-specific dashboard
- [x] Build Role-Specific Dashboards:
      - `AdminDashboard.jsx`: administrative control panel with user overview and audit links
      - `FacultyDashboard.jsx`: faculty portal with academic tools and session status
      - `StudentDashboard.jsx`: student portal with course schedule and profile status
- [x] Build Error Pages: `UnauthorizedPage.jsx` (403 forbidden role access) and `NotFoundPage.jsx` (404)
- [x] Comprehensive Automated Frontend Test Suite (`vitest` + `@testing-library/react`):
      - `LoginPage.test.jsx`: 11/11 tests passed (form rendering, validation, CAPTCHA refresh, ADMIN/FACULTY/STUDENT routing, 400/401/403/423 errors)
      - `ForgotPasswordPage.test.jsx`: 4/4 tests passed (validation, generic anti-enumeration response, 429 rate limit)
      - `ResetPasswordPage.test.jsx`: 5/5 tests passed (URL token extraction, password policy matching, successful reset, 400 error)
      - `ProtectedRoute.test.jsx`: 3/3 tests passed (unauthenticated redirect, role mismatch 403 redirect, permitted role rendering)
      - Overall Frontend Tests: **23/23 tests passed**
- [x] Frontend Production Build (`npm run build`): verified clean build with zero bundling errors

---

## Stage 11 — Frontend Refresh Token Lifecycle & Interceptor Coordination (Completed ✅)

- [x] Integrate concurrency-safe automatic refresh handling into Axios response interceptor (`frontend/src/services/apiClient.js`):
      - Intercept HTTP 401 Unauthorized responses on protected resource requests
      - Exclude authentication endpoints (`/auth/login`, `/auth/refresh`, `/auth/refresh-token`, `/auth/logout`, `/auth/captcha`, `/auth/forgot-password`, `/auth/reset-password`) to prevent recursion
- [x] Implement request serialization and queueing:
      - Coordinate in-flight refresh using `isRefreshing` lock
      - Queue concurrent 401 requests in `failedQueue` so exactly ONE `/auth/refresh` HTTP call is dispatched
      - Once rotated, resolve all queued requests with the replacement access token and retry them transparently
- [x] Enforce single retry limit (`originalRequest._retry = true`):
      - Strictly prevents infinite loops if retried request fails
- [x] Handle refresh failure & replay detection safely:
      - Reject all queued requests if refresh fails (e.g. 401/403/revoked/expired)
      - Wipe local credentials (`token`, `refreshToken`, `user`) from `localStorage`
      - Dispatch `AUTH_EVENTS.SESSION_EXPIRED` to notify React components
      - Synchronize React `AuthContext` state without full application crashes
- [x] Synchronize React `AuthContext`:
      - Listen to `AUTH_EVENTS.TOKEN_REFRESHED` and `AUTH_EVENTS.SESSION_EXPIRED` events
      - Seamlessly update `token`, `refreshToken`, and `user` state across active components
- [x] Comprehensive Automated Test Suite (`frontend/src/__tests__/RefreshTokenLifecycle.test.jsx`):
      - 6/6 tests passed: automatic refresh & transparent retry, concurrent 401 request serialization (single refresh dispatched), queued request rejection and storage cleanup on refresh failure, retry limit enforcement, exclusion of auth endpoints, and absence of refresh token handling
- [x] Overall Frontend Suite: **29/29 tests passed** across 5 test files (`LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ProtectedRoute`, `RefreshTokenLifecycle`)
- [x] Production Build Verification: `npm run build` verified clean build with zero bundling errors

---

## Stage 12 — Admin User Management API Routes (Completed ✅)

- [x] Implement `GET /api/v1/admin/users`:
      - Paginated user list via `vw_user_summary`
      - Validation for `page` (default 1) and `pageSize` (default 10, max 100)
      - Filters for `role`, `status`, and `search` query
      - Safe metadata projection strictly excluding `password_hash` and `password_reset_token_hash`
      - Consistent pagination metadata (`page`, `pageSize`, `total`, `totalPages`)
- [x] Implement `POST /api/v1/admin/users`:
      - Direct administrative provisioning of `FACULTY` and `STUDENT` accounts
      - Enforce role whitelisting (prevent unauthorized privilege escalation)
      - Duplicate prevention pre-check for username and email (HTTP 409 Conflict)
      - Password policy enforcement (8–128 characters) and bcrypt hashing
      - Invocation of stored procedure `sp_create_user` with verified signature: `(p_username, p_email, p_password_hash, p_role, p_created_by, OUT p_user_id)`
      - Return safe user entity excluding secrets (HTTP 201 Created)
- [x] Implement `GET /api/v1/admin/users/:id`:
      - Integer ID route parameter validation
      - Return safe user profile from `vw_user_summary` excluding sensitive tokens and hashes
- [x] Implement `PUT /api/v1/admin/users/:id`:
      - Canonical role validation (`ADMIN`, `FACULTY`, `STUDENT`)
      - Invocation of stored procedure `sp_update_user_role` with verified signature: `(p_user_id, p_role)`
      - Self-demotion defense: prevent active admin from demoting themselves
      - Last active admin defense: prevent demoting the sole active admin in the system
- [x] Implement `PATCH /api/v1/admin/users/:id/status`:
      - Active status validation (boolean or `0`/`1`)
      - Invocation of stored procedure `sp_update_user_status` with verified signature: `(p_user_id, p_is_active)`
      - Self-deactivation defense: prevent active admin from deactivating themselves
      - Last active admin defense: prevent deactivating the sole active admin
      - Session revocation: automatically revoke all active refresh tokens in `refresh_tokens` table upon deactivation
- [x] Enforce `verifyToken` and `requireRole('ADMIN')` globally across all `/admin/users` routes
- [x] Automated test suite `backend/scripts/testStage12.js` (`npm run test:stage12`):
      - **30/30 tests passed**: authentication rejection (401), RBAC authorization (FACULTY & STUDENT 403, ADMIN 200), pagination validation and limits, user provisioning (validation, duplicate 409, role whitelisting), single user retrieval, role updates with self-demotion & last-admin guards, status updates with self-deactivation & last-admin guards and refresh token revocation, and strict verification that zero password hashes or reset tokens are exposed.
- [x] Full Backend & Frontend Regression:
      - Stage 9 suite `npm run test:stage9`: **35/35 tests passed**
      - Stage 8 suite `npm run test:stage8`: **19/19 tests passed**
      - Stage 7 suite `npm run test:stage7`: **26/26 tests passed**
      - Stage 6 suite `npm run test:stage6`: **40/40 tests passed**
      - Stage 5 suite `npm run test:stage5`: **52/52 assertions passed**
      - Schema verification `npm run verify:schema`: **All tables, views, procedures, UDFs, triggers intact**
      - Frontend test suite `npm test`: **29/29 tests passed**
      - Frontend build `npm run build`: **Clean build in 3.22s**

---

## Stage 13 — Security Hardening (Completed ✅)

- [x] Configure `helmet` HTTP security headers:
      - Enforce `nosniff`, `SAMEORIGIN`, `Strict-Transport-Security`, `no-referrer`, and `cross-origin` resource policy for CORS API access
      - Explicitly disable `X-Powered-By` framework fingerprinting via `app.disable('x-powered-by')`
      - Pure JSON API posture: disable HTML CSP to prevent breaking frontend client deployments
- [x] Rate limiting & abuse mitigation:
      - Audited and enforced rate limiting on `/login`, `/captcha`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`, and administrative provisioning (`POST /api/v1/admin/users`)
      - Standard HTTP headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
      - Consistent JSON error response on HTTP 429
      - Documented process-local in-memory constraint (requires Redis for multi-node deployments)
- [x] Input validation & mass-assignment defense:
      - Implemented `checkUnexpectedFields` rejecting unexpected fields and mass-assignment attempts
      - Blocked prototype pollution attacks targeting `__proto__`, `constructor`, `prototype`
      - Preserved password integrity: passwords are never trimmed or silently modified
      - Strict type and bounds checking for pagination (`1 <= pageSize <= 100`) and user IDs
- [x] Information leakage & error handling:
      - Centralized `errorHandler` suppresses internal error details, stack traces, and database/SQL syntax messages in production (`NODE_ENV=production`)
      - Masked raw database/SQL errors to generic `Internal server error.`
      - Verified zero password hashes, reset token hashes, or refresh tokens exposed in responses
- [x] SQL injection defense:
      - All database access uses parameterized SQL statements (`?`) or safe stored procedure calls (`sp_create_user`, `sp_update_user_role`, `sp_update_user_status`, `sp_get_user_by_username`)
- [x] JWT and session security:
      - Enforced HS256 algorithm validation; rejected unsigned/`none` algorithm tokens
      - Minimum 32-character secret required in production
      - Added optional `JWT_ISSUER` and `JWT_AUDIENCE` claim validation support
      - Short access token lifetime (8h) and refresh token lifetime (7d)
      - Atomic single-use refresh token rotation with row-level locks (`SELECT ... FOR UPDATE`)
      - Documented stateless access token validity and frontend `localStorage` vs `HttpOnly` cookie trade-offs
- [x] Password reset & anti-enumeration:
      - Generic forgot-password response prevents account enumeration for existing, non-existent, and deactivated accounts
      - Timing attack mitigation via dummy cryptographic hash operations
      - 256-bit cryptographically secure tokens stored strictly as SHA-256 hash in database
      - In-memory dev token testing hook strictly disabled in production
      - Documented unconfigured SMTP email delivery requirement
- [x] Database audit logging integrity:
      - Status and role modifications automatically recorded in `user_audit_logs` via trigger `trg_users_after_update`
      - Confirmed secrets are never recorded in `user_audit_logs`
      - Structured logging records authentication events without recording credentials
- [x] Automated test suite `backend/scripts/testStage13.js` (`npm run test:stage13`):
      - **22/22 tests passed** across 7 security suites (headers, rate limiting, mass-assignment defense, JWT hardening, password reset anti-enumeration, information disclosure, and audit integrity).
- [x] Full Backend & Frontend Regression:
      - Stage 12 suite `npm run test:stage12`: **30/30 tests passed**
      - Stage 9 suite `npm run test:stage9`: **35/35 tests passed**
      - Stage 8 suite `npm run test:stage8`: **19/19 tests passed**
      - Stage 7 suite `npm run test:stage7`: **26/26 tests passed**
      - Stage 6 suite `npm run test:stage6`: **40/40 tests passed**
      - Stage 5 suite `npm run test:stage5`: **52/52 assertions passed**
      - Schema verification `npm run verify:schema`: **All tables, views, procedures, UDFs, triggers intact**
      - Frontend test suite `npm test`: **29/29 tests passed**
      - Frontend build `npm run build`: **Clean build in 3.38s**

---

## Stage 14 — API Integration Readiness (Completed ✅)

- [x] Export `verifyToken` and `requireRole` as a shared middleware package:
      - Implemented `backend/src/middleware/index.js` exporting `verifyToken`, `requireRole`, and `ALLOWED_ROLES`
      - Implemented `shared/middleware/index.js` providing canonical cross-module re-export hub for external ERP modules
      - Enhanced `verifyToken.js` and `requireRole.js` with dual export support (callable default + named destructuring)
      - Guaranteed zero side-effects: requiring shared middleware does not initialize DB pool, start Express, or bind ports
      - Configured `"exports"` in `backend/package.json` for monorepo package imports
- [x] Token verification & authorization contract documentation:
      - Documented HS256 algorithm enforcement, 32-character production secret requirement, `JWT_ISSUER`/`JWT_AUDIENCE` optional claim validation
      - Documented access token payload shape (`sub`, `role`, `type: 'access'`, `iat`, `exp`) and 8-hour lifetime
      - Documented HTTP 401 (Authentication Failure) vs HTTP 403 (Authorization Failure) contract
      - Formulated assessment of HTTP token verification endpoint (`POST /api/v1/auth/verify-token`): documented why local cryptographic verification via shared middleware is the canonical in-process solution, while providing reference contract for future microservice isolation
- [x] Canonical API contract update (`shared/contracts/API_CONTRACT.md`):
      - Verified and documented all implemented authentication endpoints (`/captcha`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`)
      - Verified and documented all implemented admin endpoints (`GET /admin/users`, `POST /admin/users`, `GET /admin/users/:id`, `PUT /admin/users/:id`, `PATCH /admin/users/:id/status`) and `/api/health`
      - Detailed exact request bodies, query parameters, URL params, standard response envelopes, rate limits, and error envelopes
- [x] Integration Guide authored (`docs/INTEGRATION_GUIDE.md`):
      - Detailed architectural separation of concerns between Auth and functional ERP modules
      - Documented environment variables, shared middleware imports, and protected route examples for ADMIN, FACULTY, and STUDENT
      - Documented Bearer-token header format, frontend route guards vs server-side authorization security boundaries, CORS, and HTTPS transport security
      - Step-by-step 5-stage guide for integrating future ERP modules (namespaces, foreign keys, route guards, controller context, tests)
      - Documented remaining architectural risks: `localStorage` XSS exposure, process-local rate limiting, stateless access token validity window, and SMTP email setup
- [x] Automated test suite `backend/scripts/testStage14.js` (`npm run test:stage14`):
      - **27/27 tests passed** across 4 suites (middleware exports & decoupling, verifyToken contract, requireRole enforcement, and cross-module ERP route simulation).
- [x] Full Backend & Frontend Regression:
      - Stage 14 suite `npm run test:stage14`: **27/27 tests passed**
      - Stage 13 suite `npm run test:stage13`: **24/24 tests passed**
      - Stage 12 suite `npm run test:stage12`: **30/30 tests passed**
      - Stage 9 suite `npm run test:stage9`: **35/35 tests passed**
      - Stage 8 suite `npm run test:stage8`: **19/19 tests passed**
      - Stage 7 suite `npm run test:stage7`: **26/26 tests passed**
      - Stage 6 suite `npm run test:stage6`: **40/40 tests passed**
      - Stage 5 suite `npm run test:stage5`: **52/52 assertions passed**
      - Schema verification `npm run verify:schema`: **All tables, views, procedures, UDFs, triggers intact**
      - Frontend test suite `npm test`: **29/29 tests passed**
      - Frontend build `npm run build`: **Clean build in 4.12s**

---

## Stage 15 — Testing (Completed ✅)

- [x] Backend unit tests (Jest): services, utils, validation schemas, and middleware
      - `backend/tests/unit/services/captchaService.test.js` (8 tests)
      - `backend/tests/unit/services/dbHealthService.test.js` (1 test)
      - `backend/tests/unit/utils/jwt.test.js` (10 tests)
      - `backend/tests/unit/utils/password.test.js` (6 tests)
      - `backend/tests/unit/utils/responseBuilder.test.js` (4 tests)
      - `backend/tests/unit/validations/adminValidation.test.js` (12 tests)
      - `backend/tests/unit/validations/authValidation.test.js` (15 tests)
      - `backend/tests/unit/middleware/middleware.test.js` (15 tests)
      - **Result:** **71/71 unit tests passed** across 8 test suites (`npm run test:unit`)
- [x] Backend integration tests (Supertest): auth routes, admin routes
      - `backend/tests/integration/auth.integration.test.js` (14 tests covering `/health`, `/captcha`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`)
      - `backend/tests/integration/admin.integration.test.js` (17 tests covering `GET /users`, `POST /users`, `GET /users/:id`, `PUT /users/:id`, `PATCH /users/:id/status`, pagination, role whitelist, self-demotion/deactivation defenses)
      - `backend/tests/integration/testHelper.js` (reusable helpers for CAPTCHA solving, test user creation via stored procedures, and cleanup)
      - **Result:** **31/31 auth and admin integration tests passed**
- [x] Frontend unit tests (React Testing Library): ProtectedRoute, LoginForm
      - `frontend/src/__tests__/ProtectedRoute.test.jsx` (3 tests: unauthenticated redirect, unauthorized role 403, permitted render)
      - `frontend/src/__tests__/LoginForm.test.jsx` (4 tests: field rendering, password reveal toggle, client validation, input typing and login dispatch)
      - `frontend/src/__tests__/LoginPage.test.jsx` (11 tests: full page form interactions, server error handling, role routing)
      - `frontend/src/__tests__/ForgotPasswordPage.test.jsx` (4 tests)
      - `frontend/src/__tests__/ResetPasswordPage.test.jsx` (5 tests)
      - `frontend/src/__tests__/RefreshTokenLifecycle.test.jsx` (6 tests)
      - **Result:** **33/33 frontend tests passed** across 6 test files (`npm test`)
      - **Frontend build:** Clean production build via `npm run build` (0 bundling errors)
- [x] End-to-end test plan for full login → dashboard → logout flow
      - Comprehensive architectural plan authored at `docs/E2E_TEST_PLAN.md` covering objectives, prerequisites, test account personas, sequence diagrams, 6 detailed manual test cases (TC-E2E-01 through TC-E2E-06), and acceptance criteria
      - Automated E2E lifecycle test suite created at `backend/tests/integration/e2eFlow.integration.test.js` (1 test executing complete lifecycle: CAPTCHA -> Login -> Dashboard API -> Silent Refresh -> Replay Rejection -> Repeat API -> Logout -> Revocation Verification)
      - **Result:** **Passed cleanly in 300ms**
- [x] Test RBAC: confirm each role cannot access other roles' endpoints (403 expected)
      - Automated RBAC integration suite created at `backend/tests/integration/rbac.integration.test.js` (17 tests)
      - Verified unauthenticated requests return HTTP 401 Unauthorized
      - Verified STUDENT cannot access admin routes or faculty grade-entry (HTTP 403 Forbidden)
      - Verified FACULTY cannot access admin routes or student grades (HTTP 403 Forbidden)
      - Verified ADMIN cannot access student-only or faculty-only routes (HTTP 403 Forbidden)
      - Verified shared staff route allows both ADMIN and FACULTY while blocking STUDENT
      - Verified error envelope shape strictly preserves security (`{ success: false, message: "You do not have permission to access this resource.", data: null, errors: null }`) without leaking internal schema
      - **Result:** **17/17 RBAC tests passed**
- [x] Full Backend Stage 15 Suite (`npm run test:stage15`):
      - **120/120 tests passed** across 12 test suites in 17.08s (0 failures)
- [x] Full Regression Verification Across All Stages:
      - Stage 14 suite `npm run test:stage14`: **27/27 passed**
      - Stage 13 suite `npm run test:stage13`: **24/24 passed**
      - Stage 12 suite `npm run test:stage12`: **30/30 passed**
      - Stage 9 suite `npm run test:stage9`: **35/35 passed**
      - Stage 8 suite `npm run test:stage8`: **19/19 passed**
      - Stage 7 suite `npm run test:stage7`: **26/26 passed**
      - Stage 6 suite `npm run test:stage6`: **40/40 passed**
      - Stage 5 suite `npm run test:stage5`: **52/52 assertions passed**
      - Database schema verification `npm run verify:schema`: **All 4 tables, 2 views, 4 procedures, 3 UDFs, 1 trigger intact**

---

## Stage 16 — Documentation & Final Review (Completed ✅ — Release v1.0.0)

- [x] Update `README.md` with final setup instructions, testing commands, security principles, and cross-module architecture
- [x] Create `docs/DATABASE_DESIGN.md` — ER diagram (Mermaid), table specifications, views, stored procedures, triggers, UDFs
- [x] Verify & update `docs/INTEGRATION_GUIDE.md` — step-by-step guide for future ERP module authors
- [x] Create `docs/SECURITY.md` — security decisions, threat model, mitigations, and honest operational limitations
- [x] Conduct final code review against OWASP Top 10 (A01 through A10 addressed and documented)
- [x] Tag `v1.0.0` release — bumped `backend/package.json` and `frontend/package.json` to `v1.0.0`, marked release in documentation
- [x] Full Project Regression Verification:
      - Backend Stage 15 Suite: `npm run test:stage15` — **120/120 passed** across 12 test suites (17.08s)
      - Backend Unit Suite: `npm run test:unit` — **71/71 passed** across 8 test suites (4.08s)
      - Backend Integration Suite: `npm run test:integration` — **49/49 passed** across 4 test suites (10.27s)
      - Frontend Suite: `npm test` — **33/33 passed** across 6 test suites (8.53s)
      - Frontend Build: `npm run build` — Clean production bundle (4.67s)
      - Schema Verification: `npm run verify:schema` — All 4 tables, 2 views, 4 procedures, 3 UDFs, 1 trigger intact
      - Stages 5–14 regression suites: **100% passing across all 253 historical assertions**

---

*Last updated: Stage 16 completion — Final Release v1.0.0*
