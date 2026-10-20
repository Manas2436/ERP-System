# ───────────────────────────────────────────────────────────────────────────────
# Shared API Contracts — College ERP Authentication Module
#
# This file documents the canonical API routes, role constants, response
# envelopes, JWT verification rules, and integration contracts that ALL ERP
# modules MUST adhere to when integrating with the Authentication module.
#
# This plain documentation serves as the single source of truth for frontend,
# backend, and external ERP module developers without tooling dependencies.
# ───────────────────────────────────────────────────────────────────────────────

# ── Role Constants ─────────────────────────────────────────────────────────────
#
#   ADMIN   – College administrator; provisions and manages user accounts and permissions
#   FACULTY – Teaching/non-teaching academic staff member
#   STUDENT – Enrolled student
#
# These strings are used as-is in JWT payloads (field: "role") and in the
# MySQL users table (ENUM column).

# ── Base URL Convention ────────────────────────────────────────────────────────
#
#   Health check endpoint:
#       GET /api/health
#
#   All authentication API routes are prefixed with:
#       /api/v1/auth
#
#   All administrative management routes are prefixed with:
#       /api/v1/admin
#
#   Future ERP modules MUST mount under separate prefixes, e.g.:
#       /api/v1/attendance
#       /api/v1/courses
#       /api/v1/fees
#       /api/v1/examination
#   This guarantees that route namespaces never collide across modules.

# ── Standard JSON Response Envelope ───────────────────────────────────────────
#
#   Every API response (success or error) strictly conforms to:
#   {
#     "success": true | false,
#     "message": "Human-readable description",
#     "data":    { ... } | null,       // populated on success
#     "errors":  [ ... ] | null        // populated on validation / client errors
#   }
#
#   Standard HTTP Status Codes:
#     200 OK                    – Request succeeded
#     201 Created               – Resource successfully created
#     400 Bad Request           – Input validation failure or unexpected request fields
#     401 Unauthorized          – Missing, invalid, expired, or tampered token / bad credentials
#     403 Forbidden             – Valid authentication, but insufficient role permissions or account deactivated
#     404 Not Found             – Resource does not exist
#     409 Conflict              – Duplicate unique field (e.g., username/email) or self-harm restriction
#     422 Unprocessable Entity  – Semantic validation failure
#     423 Locked                – Account temporarily locked due to excessive failed attempts
#     429 Too Many Requests     – Exceeded rate limit threshold
#     500 Internal Server Error – Unhandled server or database error (sanitized in production)

# ── Infrastructure Health Check Endpoint ──────────────────────────────────────
#
#   GET /api/health
#     Unauthenticated system status check. Reports API and MySQL health separately.
#     Response (HTTP 200 / HTTP 503):
#     {
#       "success": true,
#       "message": "Health check passed.",
#       "data": {
#         "status": "healthy" | "degraded",
#         "api": {
#           "status": "ok",
#           "uptimeSeconds": 124.5
#         },
#         "database": {
#           "status": "connected" | "disconnected",
#           "latencyMs": 4.2
#         }
#       },
#       "errors": null
#     }

# ── Authentication Endpoints (/api/v1/auth) ───────────────────────────────────
#
#   GET /api/v1/auth/captcha
#     Generates a single-use arithmetic challenge with 3-minute expiry.
#     Rate Limit: 60 requests / 15 minutes per IP.
#     Headers emitted: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "CAPTCHA challenge generated.",
#       "data": {
#         "captchaId": "<64-hex-token-id>",
#         "question": "What is 14 + 7?",
#         "expiresInSeconds": 180
#       },
#       "errors": null
#     }
#
#   POST /api/v1/auth/login
#     Authenticates credentials after single-use CAPTCHA verification.
#     Enforces 5-attempt threshold with 15-minute temporary lockout.
#     Rate Limit: 20 requests / 15 minutes per IP.
#     Strict Body Validation (no unexpected fields allowed):
#     {
#       "username": "<string: 3-50 chars>",
#       "password": "<string: 8-128 chars>",
#       "captchaId": "<string: 64-hex id>",
#       "captchaAnswer": "<string: numeric answer>"
#     }
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "Login successful.",
#       "data": {
#         "token": "<jwt-access-token-string>",
#         "refreshToken": "<jwt-refresh-token-string>",
#         "tokenType": "Bearer",
#         "expiresIn": "8h",
#         "user": {
#           "id": 1,
#           "username": "admin",
#           "email": "admin@college.edu",
#           "role": "ADMIN"
#         }
#       },
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Validation error or wrong CAPTCHA answer
#       HTTP 401: Invalid username or password (timing-mitigated)
#       HTTP 403: Account is deactivated (is_active = 0)
#       HTTP 423: Account temporarily locked (5 failed attempts)
#       HTTP 429: Rate limit exceeded
#
#   POST /api/v1/auth/refresh (and alias: POST /api/v1/auth/refresh-token)
#     Atomically rotates the submitted refresh token, links rotation chain,
#     and returns a replacement access token and new refresh token.
#     Prevents replay attacks and concurrent refresh race conditions.
#     Rate Limit: 30 requests / 15 minutes per IP.
#     Strict Body Validation:
#     {
#       "refreshToken": "<jwt-refresh-token-string>"
#     }
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "Token refreshed successfully.",
#       "data": {
#         "token": "<new-jwt-access-token-string>",
#         "refreshToken": "<new-replacement-jwt-refresh-token-string>",
#         "tokenType": "Bearer",
#         "expiresIn": "8h",
#         "user": {
#           "id": 1,
#           "username": "admin",
#           "email": "admin@college.edu",
#           "role": "ADMIN"
#         }
#       },
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Validation error or missing token
#       HTTP 401: Invalid, expired, or revoked refresh token (replay detected)
#       HTTP 403: Account deactivated
#       HTTP 429: Rate limit exceeded
#
#   POST /api/v1/auth/logout
#     Revokes the submitted refresh token in the database.
#     Operation is idempotent: subsequent calls with the same token succeed safely.
#     Rate Limit: 30 requests / 15 minutes per IP.
#     Strict Body Validation:
#     {
#       "refreshToken": "<jwt-refresh-token-string>"
#     }
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "Logout successful. Session revoked.",
#       "data": null,
#       "errors": null
#     }
#
#   POST /api/v1/auth/forgot-password
#     Initiates password recovery. Accepts email OR username (anti-enumeration).
#     Generates cryptographically random 256-bit token; stores only SHA-256 hash in DB.
#     Token expiry: 15 minutes.
#     Rate Limit: 10 requests / 15 minutes per IP.
#     Strict Body Validation (either email OR username, strictly no extra fields):
#     {
#       "email": "<valid-email-address>"
#     }
#     OR
#     {
#       "username": "<valid-username>"
#     }
#     Response (HTTP 200 - identical for existing, non-existent, and deactivated accounts):
#     {
#       "success": true,
#       "message": "If an account matching the provided identifier exists, a password reset link has been sent.",
#       "data": null,
#       "errors": null
#     }
#
#   POST /api/v1/auth/reset-password
#     Completes password reset with single-use verification.
#     Atomically verifies token hash and expiry, updates password (bcrypt), consumes token,
#     revokes all active refresh-token sessions for the user, and clears lockout counters.
#     Rate Limit: 15 requests / 15 minutes per IP.
#     Strict Body Validation:
#     {
#       "token": "<string: 16-255 chars, reset token>",
#       "newPassword": "<string: 8-128 chars>"
#     }
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "Password has been reset successfully. Please log in with your new password.",
#       "data": null,
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Invalid or expired password reset token
#       HTTP 403: Account is deactivated
#       HTTP 429: Rate limit exceeded

# ── Admin User-Management Endpoints (/api/v1/admin) ───────────────────────────
#
#   All endpoints require:
#     Authorization: Bearer <access-token>
#   AND user role strictly equals 'ADMIN'.
#
#   GET /api/v1/admin/users
#     Paginated user directory using vw_user_summary. Strictly excludes secrets.
#     Query Parameters:
#       page     (optional, integer >= 1, default: 1)
#       pageSize (optional, integer 1-100, default: 10)
#       role     (optional, 'ADMIN' | 'FACULTY' | 'STUDENT')
#       status   (optional, 'active' | 'inactive' | 'locked')
#       search   (optional, string matching username or email)
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "User directory retrieved successfully.",
#       "data": {
#         "users": [
#           {
#             "id": 1,
#             "username": "admin",
#             "email": "admin@college.edu",
#             "role": "ADMIN",
#             "role_label": "Administrator",
#             "is_active": 1,
#             "account_status": "ACTIVE",
#             "created_by": null,
#             "creator_username": null,
#             "last_login_at": "2026-10-17T12:00:00.000Z",
#             "created_at": "2026-10-17T10:00:00.000Z",
#             "updated_at": "2026-10-17T10:00:00.000Z"
#           }
#         ],
#         "pagination": {
#           "page": 1,
#           "pageSize": 10,
#           "total": 24,
#           "totalPages": 3,
#           "hasNext": true,
#           "hasPrev": false
#         }
#       },
#       "errors": null
#     }
#
#   POST /api/v1/admin/users
#     Provisions a new user account via sp_create_user.
#     Rate Limit: 30 requests / 15 minutes per IP.
#     Strict Body Validation:
#     {
#       "username": "<string: 3-50 chars, alphanumeric + underscore>",
#       "email": "<string: valid email format, max 100 chars>",
#       "password": "<string: 8-128 chars>",
#       "role": "ADMIN" | "FACULTY" | "STUDENT"
#     }
#     Response (HTTP 201):
#     {
#       "success": true,
#       "message": "User account created successfully.",
#       "data": {
#         "user": {
#           "id": 25,
#           "username": "prof_rao",
#           "email": "rao@college.edu",
#           "role": "FACULTY",
#           "is_active": 1,
#           "created_by": 1,
#           "created_at": "2026-10-17T12:30:00.000Z",
#           "updated_at": "2026-10-17T12:30:00.000Z"
#         }
#       },
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Input validation failure or unexpected fields
#       HTTP 401: Missing or invalid token
#       HTTP 403: Authenticated user is not an ADMIN
#       HTTP 409: Duplicate username or email
#
#   GET /api/v1/admin/users/:id
#     Retrieves safe user profile metadata from vw_user_summary.
#     URL Parameter:
#       id: positive integer
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "User profile retrieved successfully.",
#       "data": {
#         "user": {
#           "id": 25,
#           "username": "prof_rao",
#           "email": "rao@college.edu",
#           "role": "FACULTY",
#           "role_label": "Faculty Member",
#           "is_active": 1,
#           "account_status": "ACTIVE",
#           "created_by": 1,
#           "creator_username": "admin",
#           "last_login_at": null,
#           "created_at": "2026-10-17T12:30:00.000Z",
#           "updated_at": "2026-10-17T12:30:00.000Z"
#         }
#       },
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Invalid user ID parameter
#       HTTP 401: Missing or invalid token
#       HTTP 403: Authenticated user is not an ADMIN
#       HTTP 404: User not found
#
#   PUT /api/v1/admin/users/:id
#     Updates user role via sp_update_user_role. Triggers trg_users_after_update audit logging.
#     Prevents self-demotion and demotion of the only active administrator.
#     URL Parameter:
#       id: positive integer
#     Strict Body Validation:
#     {
#       "role": "ADMIN" | "FACULTY" | "STUDENT"
#     }
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "User role updated successfully.",
#       "data": {
#         "user": {
#           "id": 25,
#           "username": "prof_rao",
#           "email": "rao@college.edu",
#           "role": "ADMIN",
#           "is_active": 1,
#           "updated_at": "2026-10-17T12:35:00.000Z"
#         }
#       },
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Invalid role, unexpected fields, or self-demotion attempted
#       HTTP 401: Missing or invalid token
#       HTTP 403: Authenticated user is not an ADMIN
#       HTTP 404: User not found
#       HTTP 409: Cannot demote the only active administrator
#
#   PATCH /api/v1/admin/users/:id/status
#     Activates or deactivates account via sp_update_user_status. Triggers trg_users_after_update audit logging.
#     On deactivation (isActive: false / 0), immediately revokes all active refresh-token sessions in DB.
#     Prevents self-deactivation and deactivation of the only active administrator.
#     URL Parameter:
#       id: positive integer
#     Strict Body Validation:
#     {
#       "isActive": true | false | 1 | 0
#     }
#     Response (HTTP 200):
#     {
#       "success": true,
#       "message": "User account activated successfully." | "User account deactivated and active sessions revoked.",
#       "data": {
#         "user": {
#           "id": 25,
#           "username": "prof_rao",
#           "email": "rao@college.edu",
#           "role": "FACULTY",
#           "is_active": 0,
#           "updated_at": "2026-10-17T12:40:00.000Z"
#         }
#       },
#       "errors": null
#     }
#     Error Responses:
#       HTTP 400: Invalid status format or self-deactivation attempted
#       HTTP 401: Missing or invalid token
#       HTTP 403: Authenticated user is not an ADMIN
#       HTTP 404: User not found
#       HTTP 409: Cannot deactivate the only active administrator

# ── JWT Specification & Token Lifecycle ───────────────────────────────────────
#
#   Algorithm:
#     HS256 (HMAC with SHA-256) strictly enforced. Tokens with algorithm "none",
#     unsigned tokens, or mismatched keys are rejected.
#
#   Secret Requirements:
#     - Defined via JWT_SECRET in environment variables.
#     - Must be at least 32 characters (256 bits) in production.
#     - NEVER expose JWT_SECRET in client code, responses, logs, or Git commits.
#
#   Access Token Payload Shape:
#   {
#     "sub":  "<user_id: string>",
#     "role": "ADMIN" | "FACULTY" | "STUDENT",
#     "type": "access",
#     "iat":  <unix-timestamp: issued-at>,
#     "exp":  <unix-timestamp: expires-at>,
#     "iss":  "<optional-issuer-string>",
#     "aud":  "<optional-audience-string>"
#   }
#   Lifetime: 8 hours (configured via JWT_EXPIRES_IN=8h).
#
#   Refresh Token Payload Shape:
#   {
#     "sub":  "<user_id: string>",
#     "type": "refresh",
#     "jti":  "<32-hex-unique-token-id>",
#     "iat":  <unix-timestamp: issued-at>,
#     "exp":  <unix-timestamp: expires-at>,
#     "iss":  "<optional-issuer-string>",
#     "aud":  "<optional-audience-string>"
#   }
#   Lifetime: 7 days (configured via JWT_REFRESH_EXPIRES_IN=7d).
#   Storage: Raw refresh tokens are NEVER stored in MySQL. Only their SHA-256 hex
#   hash (64 characters) is stored in the `refresh_tokens.token_hash` column.
#   Rotation: Single-use atomic rotation. Presenting a revoked refresh token triggers
#   replay attack detection and rejects the request.

# ── Token Verification: Local Middleware vs HTTP Endpoint Assessment ──────────
#
#   1. Canonical Implementation — Local Cryptographic Verification:
#      In this monolithic Node.js / Express architecture, external ERP modules
#      verify access tokens LOCALLY using the shared middleware:
#
#        const { verifyToken, requireRole } = require('shared/middleware');
#
#      Benefits of Local Verification:
#      - Zero HTTP network latency (sub-millisecond cryptographic execution).
#      - Stateless: does not execute database queries on every API hit.
#      - Eliminates network bottlenecks and cascading service failures.
#
#   2. HTTP Token Verification Endpoint Assessment:
#      - Current Implementation Status: NOT IMPLEMENTED.
#      - Rationale: In a monorepo / shared deployment, exposing an HTTP verification
#        endpoint (`POST /api/v1/auth/verify-token`) would add redundant HTTP overhead,
#        network serialization costs, and potential circular service dependencies
#        without adding security value over in-process verification.
#      - When is an HTTP Endpoint Needed?
#        If future ERP modules are deployed as physically isolated microservices
#        written in different languages where distributing the symmetric secret is
#        disallowed, or prior to migrating to asymmetric RS256 public key verification.
#      - Reference Specification (if implemented in future microservice phase):
#        POST /api/v1/auth/verify-token
#        Headers: Authorization: Bearer <jwt-access-token>
#        Success (HTTP 200):
#        {
#          "success": true,
#          "message": "Token verified successfully.",
#          "data": { "id": "1", "role": "FACULTY" },
#          "errors": null
#        }
#        Failure (HTTP 401):
#        {
#          "success": false,
#          "message": "Invalid token.",
#          "data": null,
#          "errors": null
#        }

# ── Inter-Module Integration Contract ─────────────────────────────────────────
#
#   1. Protected Route Middleware Usage:
#      Other ERP modules import the shared middleware:
#
#      const { verifyToken, requireRole } = require('shared/middleware');
#
#      router.get(
#        '/api/v1/attendance/report',
#        verifyToken,
#        requireRole('FACULTY', 'ADMIN'),
#        attendanceController.getReport
#      );
#
#   2. Request Context Populated by verifyToken:
#      Downstream route handlers have access to:
#        req.user = {
#          id:   "<user_id: string>",
#          role: "ADMIN" | "FACULTY" | "STUDENT"
#        };
#      External modules MUST use req.user.id as the foreign key into their own tables.
#
#   3. Authentication vs Authorization Error Contract:
#      - HTTP 401 Unauthorized:
#        Emitted when the client fails to prove identity (missing token, invalid scheme,
#        expired token, malformed token, tampered signature).
#        Example: { "success": false, "message": "Token has expired. Please log in again.", "data": null, "errors": null }
#      - HTTP 403 Forbidden:
#        Emitted when identity is verified, but the user lacks permissions for the action
#        (e.g., STUDENT attempting to access an ADMIN route) or account is deactivated.
#        Example: { "success": false, "message": "You do not have permission to access this resource.", "data": null, "errors": null }
#
#   4. Database Foreign Key Convention:
#      External ERP module tables MUST reference `users.id` from the auth database
#      as a foreign key. They MUST NOT duplicate user credentials, names, or roles
#      in their tables; they query the Authentication Module or vw_user_summary for display.
#
#   5. Versioning:
#      The /v1 contract is stable. Any breaking changes will be published under /v2
#      with a documented migration path.
