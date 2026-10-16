# College ERP — Authentication Module: Project Plan

> **Legend:** `[ ]` Not started · `[/]` In progress · `[x]` Completed  
> **Current Stage:** Stage 8 — Logout & Refresh Token Lifecycle ✅

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

- [ ] Scaffold React app inside `frontend/` using Create React App or Vite
- [ ] Install and configure Tailwind CSS (PostCSS config, `tailwind.config.js`)
- [ ] Configure `frontend/.env` (API base URL, CAPTCHA site key)
- [ ] Install Axios for API communication
- [ ] Create `frontend/src/services/apiClient.js` — Axios instance with base URL & interceptors
- [ ] Create `frontend/src/context/AuthContext.jsx` — AuthProvider skeleton
- [ ] Create `frontend/src/routes/AppRouter.jsx` — React Router v6 skeleton with placeholder pages
- [ ] Verify frontend dev server starts cleanly: `npm start`

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

## Stage 9 — Role-Based Dashboards (Frontend)

- [ ] Create `frontend/src/components/auth/ProtectedRoute.jsx`
      — reads token from context, checks role, redirects unauthorized users
- [ ] Create `frontend/src/pages/auth/LoginPage.jsx`
- [ ] Create `frontend/src/pages/admin/AdminDashboard.jsx` — skeleton only
- [ ] Create `frontend/src/pages/faculty/FacultyDashboard.jsx` — skeleton only
- [ ] Create `frontend/src/pages/student/StudentDashboard.jsx` — skeleton only
- [ ] Configure React Router so each role lands on its own dashboard after login
- [ ] Verify that manually changing the URL does not grant access to another role's page

---

## Stage 10 — Logout

- [ ] Implement `POST /api/v1/auth/logout` (server-side token blacklist or short expiry strategy)
- [ ] Clear tokens from frontend state and localStorage/sessionStorage on logout
- [ ] Redirect to LoginPage after logout
- [ ] Verify protected routes become inaccessible after logout

---

## Stage 11 — Forgot Password & Secure Reset Password

- [ ] Implement `POST /api/v1/auth/forgot-password`:
      1. Accept `email`
      2. Look up user — always return the same generic response (no user enumeration)
      3. Generate a cryptographically random reset token
      4. Hash the token and store in `password_reset_tokens` with expiry
      5. Send reset link via email (SMTP / nodemailer)
- [ ] Implement `POST /api/v1/auth/reset-password`:
      1. Accept `resetToken` + `newPassword`
      2. Verify token using `fn_is_password_reset_token_valid` UDF
      3. Hash new password with bcrypt
      4. Update `users.password_hash` + mark token as `used_at`
- [ ] Create `frontend/src/pages/auth/ForgotPasswordPage.jsx`
- [ ] Create `frontend/src/pages/auth/ResetPasswordPage.jsx`
- [ ] Test full reset flow end-to-end

---

## Stage 12 — Refresh Token Support

- [ ] Implement `POST /api/v1/auth/refresh-token`:
      — accept a valid refresh token, issue a new access token
- [ ] Design a secure refresh token storage strategy (httpOnly cookie or DB table)
- [ ] Implement automatic token refresh in the frontend Axios interceptor

---

## Stage 13 — Security Hardening

- [ ] Add `helmet` HTTP security headers (already installed in Stage 2)
- [ ] Enforce HTTPS-only cookies for tokens (if using cookies)
- [ ] Apply `express-rate-limit` to login and forgot-password endpoints
- [ ] Validate and sanitize all inputs (reject unexpected fields)
- [ ] Review and confirm no sensitive data leaks in API error responses
- [ ] Confirm no SQL injection vectors (all parameterized queries / stored procedures)
- [ ] Review JWT expiry times; confirm refresh token rotation is in place
- [ ] Add login-attempt audit logging to `audit_log` table

---

## Stage 14 — API Integration Readiness

- [ ] Export `verifyToken` and `requireRole` as a shared middleware package
- [ ] Document the token verification endpoint for microservice integrations
- [ ] Write integration guide in `docs/INTEGRATION_GUIDE.md`
- [ ] Update `shared/contracts/API_CONTRACT.md` with any changes from earlier stages

---

## Stage 15 — Testing

- [ ] Backend unit tests (Jest): services, utils, validation schemas
- [ ] Backend integration tests (Supertest): auth routes, admin routes
- [ ] Frontend unit tests (React Testing Library): ProtectedRoute, LoginForm
- [ ] End-to-end test plan for full login → dashboard → logout flow
- [ ] Test RBAC: confirm each role cannot access other roles' endpoints (403 expected)

---

## Stage 16 — Documentation & Final Review

- [ ] Update `README.md` with final setup instructions and screenshots
- [ ] Create `docs/DATABASE_DESIGN.md` — ER diagram and schema description
- [ ] Create `docs/INTEGRATION_GUIDE.md` — guide for future ERP module authors
- [ ] Create `docs/SECURITY.md` — security decisions, threat model, mitigations
- [ ] Conduct final code review against OWASP Top 10
- [ ] Tag `v1.0.0` release

---

*Last updated: Stage 1 completion*
