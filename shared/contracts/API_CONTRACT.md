# ───────────────────────────────────────────────────────────────────────────────
# Shared API Contracts — College ERP Authentication Module
#
# This file documents the canonical API routes, role constants, and response
# envelope that ALL ERP modules MUST adhere to when integrating with the
# Authentication module.  It is intentionally kept as plain documentation (not
# auto-generated code) so it can be read by frontend, backend, and external
# module developers without any tooling dependency.
# ───────────────────────────────────────────────────────────────────────────────

# ── Role Constants ─────────────────────────────────────────────────────────────
#
#   ADMIN   – College administrator; can create/manage all user accounts
#   FACULTY – Teaching/non-teaching staff member
#   STUDENT – Enrolled student
#
# These strings are used as-is in JWT payloads (field: "role") and in the
# MySQL users table (ENUM column).

# ── Base URL Convention ────────────────────────────────────────────────────────
#
#   All authentication API routes are prefixed with:
#       /api/v1/auth
#
#   Future ERP modules should mount under separate prefixes, e.g.:
#       /api/v1/attendance
#       /api/v1/fees
#       /api/v1/examination
#   ...so that the auth module's routes never collide with module routes.

# ── Standard JSON Response Envelope ───────────────────────────────────────────
#
#   Every API response (success or error) returns:
#   {
#     "success": true | false,
#     "message": "Human-readable description",
#     "data":    { ... } | null,       // present on success
#     "errors":  [ ... ] | null        // present on validation / auth errors
#   }
#
#   HTTP status codes follow REST conventions:
#     200  OK
#     201  Created
#     400  Bad Request (validation failure)
#     401  Unauthorized (missing or invalid token)
#     403  Forbidden (valid token, insufficient role)
#     404  Not Found
#     409  Conflict (duplicate resource)
#     422  Unprocessable Entity
#     429  Too Many Requests (rate limited)
#     500  Internal Server Error

# ── Authentication Endpoints ──────────────────────────────────────────────────
#
#   GET    /api/v1/auth/captcha [Implemented & Verified in Stage 7]
#     Generates a single-use arithmetic challenge with 3-minute expiry.
#     Returns:
#     {
#       "captchaId": "<64-hex string>",
#       "question": "What is 14 + 7?",
#       "expiresInSeconds": 180
#     }
#
#   POST   /api/v1/auth/login [Implemented & Verified in Stage 7]
#     Authenticates credentials after single-use CAPTCHA verification.
#     Enforces 5-attempt threshold with 15-minute lockout.
#     Body:
#     {
#       "username": "<string: 3-50 chars>",
#       "password": "<string: 8-128 chars>",
#       "captchaId": "<string: 64-hex id>",
#       "captchaAnswer": "<string: expected answer>"
#     }
#     Returns:
#     {
#       "token": "<JWT access token (8h expiry)>",
#       "refreshToken": "<JWT refresh token (7d expiry)>",
#       "tokenType": "Bearer",
#       "expiresIn": "8h",
#       "user": {
#         "id": <number>,
#         "username": "<string>",
#         "email": "<string>",
#         "role": "ADMIN" | "FACULTY" | "STUDENT"
#       }
#     }
#
#   POST   /api/v1/auth/refresh (alias: /api/v1/auth/refresh-token) [Implemented & Verified in Stage 8]
#     Atomically rotates the submitted refresh token, links rotation chain,
#     and returns a replacement access token and new refresh token.
#     Prevents replay attacks and concurrent refresh race conditions.
#     Body:
#     {
#       "refreshToken": "<JWT refresh token string>"
#     }
#     Returns:
#     {
#       "token": "<new JWT access token (8h expiry)>",
#       "refreshToken": "<new replacement JWT refresh token (7d expiry)>",
#       "tokenType": "Bearer",
#       "expiresIn": "8h",
#       "user": {
#         "id": <number>,
#         "username": "<string>",
#         "email": "<string>",
#         "role": "ADMIN" | "FACULTY" | "STUDENT"
#       }
#     }
#
#   POST   /api/v1/auth/logout [Implemented & Verified in Stage 8]
#     Revokes the submitted refresh token in the database.
#     Operation is idempotent (repeated calls succeed safely).
#     Note on Access Tokens: Stateless JWT access tokens remain valid until their
#     natural expiration (e.g. 8h). Logout revokes the session's refresh capability
#     so no further access tokens can be issued.
#     Body:
#     {
#       "refreshToken": "<JWT refresh token string>"
#     }
#     Returns:
#     {
#       "success": true,
#       "message": "Logout successful. Session revoked.",
#       "data": null,
#       "errors": null
#     }
#
#   POST   /api/v1/auth/forgot-password (Planned)
#     Body: { email }
#
#   POST   /api/v1/auth/reset-password (Planned)
#     Body: { resetToken, newPassword }

# ── Admin User-Management Endpoints (planned) ─────────────────────────────────
#
#   GET    /api/v1/admin/users            – list all users (paginated)
#   POST   /api/v1/admin/users            – create a new user
#   GET    /api/v1/admin/users/:id        – get user details
#   PUT    /api/v1/admin/users/:id        – update user details / role
#   PATCH  /api/v1/admin/users/:id/status – activate or deactivate account
#   DELETE /api/v1/admin/users/:id        – soft-delete a user

# ── JWT Payload Shape ──────────────────────────────────────────────────────────
#
#   {
#     "sub":  <user_id: number>,
#     "role": "ADMIN" | "FACULTY" | "STUDENT",
#     "iat":  <issued-at: unix timestamp>,
#     "exp":  <expiry: unix timestamp>
#   }
#
#   External ERP modules MUST verify tokens using the shared JWT_SECRET (or a
#   public key if RS256 is adopted later).  They MUST NOT bypass token
#   verification or trust the role field from the frontend.

# ── Inter-Module Integration Notes ────────────────────────────────────────────
#
#   1. Token Verification Middleware
#      The auth module will export a reusable Express middleware:
#        verifyToken(req, res, next)        – validates JWT
#        requireRole(...roles)(req, res, next) – enforces RBAC
#      External modules may import this middleware directly (monorepo) or
#      call the /api/v1/auth/verify-token endpoint (microservice mode).
#
#   2. User Identity
#      After token verification, req.user will contain:
#        { id, role, name }
#      External modules use req.user.id as the foreign key into their own tables.
#
#   3. Versioning
#      Breaking changes to the API contract will increment the version prefix
#      (/api/v2/...).  v1 will remain supported for a deprecation window.
