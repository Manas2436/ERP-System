# College ERP — Inter-Module Integration Guide

**Document Type:** Technical Integration Specification  
**Status:** Canonical Reference — Stage 14 Complete ✅  
**Scope:** Guide for integrating future functional ERP modules (e.g., Attendance, Course Management, Student Records, Faculty Management, Examination, Fees) with the Authentication Module.

---

## 1. Overview & Architectural Boundaries

The College ERP system uses a modular architecture where the **Authentication Module** acts as the single authority for user identity, role-based permissions, and session lifecycles.

```
                              ┌────────────────────────────────────────┐
                              │       React Client (Frontend)          │
                              │  - Stores Access Token in localStorage │
                              │  - Attaches: Authorization: Bearer JWT │
                              └───────────────────┬────────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────┴─────────────────────────────────────────────────┐
│ Express API Application Router                                                                    │
│                                                                                                   │
│  ┌──────────────────────────────┐                 ┌────────────────────────────────────────────┐  │
│  │ Authentication Module        │                 │ Future Functional ERP Modules              │  │
│  │ (/api/v1/auth & /admin)      │                 │ (/api/v1/attendance, /courses, /fees, ...) │  │
│  │ - Issues JWT access tokens   │                 │ - Imports shared verifyToken & requireRole │  │
│  │ - Manages refresh sessions   │                 │ - Validates token in-process (stateless)   │  │
│  │ - Manages user accounts      │                 │ - Reads req.user = { id, role }            │  │
│  │ - Owns `users` table         │                 │ - References users.id as Foreign Key       │  │
│  └──────────────┬───────────────┘                 └─────────────────────┬──────────────────────┘  │
└─────────────────┼───────────────────────────────────────────────────────┼─────────────────────────┘
                  │                                                       │
                  ▼                                                       ▼
┌───────────────────────────────────┐               ┌───────────────────────────────────────────────┐
│ Auth Database Schema              │               │ Functional Schemas / Tables                   │
│ - users                           │◄──────────────┤ - attendance (user_id FK -> users.id)         │
│ - refresh_tokens                  │  Foreign Key  │ - student_courses (student_id FK -> users.id) │
│ - user_audit_logs                 │               │ - fee_invoices (user_id FK -> users.id)       │
└───────────────────────────────────┘               └───────────────────────────────────────────────┘
```

### Separation of Concerns:
* **Authentication Module Owns:** Credentials, password hashing (bcrypt), CAPTCHA verification, JWT issuance/rotation, user directory (`users`), administrative provisioning, and account audit logs.
* **External Functional Modules Own:** Business domains (courses, attendance marks, exam grades, fee receipts). External modules **MUST NOT** manage user credentials, passwords, or duplicate user identity tables. They store `user_id` as a foreign key pointing to `users.id`.

---

## 2. Integration Prerequisites & Configuration

To integrate a new ERP module within the Node.js / Express backend, the following prerequisites must be met:

### 2.1 Environment Configuration (`.env`)
All modules verifying JWT tokens in the deployment must read the same cryptographic configuration from environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | None | Cryptographic secret used for HS256 signing and verification. Must be at least 32 characters in production. **Never expose or commit this key.** |
| `JWT_EXPIRES_IN` | No | `8h` | Lifetime of access tokens. |
| `JWT_ISSUER` | No | `undefined` | Optional issuer claim (`iss`) validation. |
| `JWT_AUDIENCE` | No | `undefined` | Optional audience claim (`aud`) validation. |

> [!CAUTION]
> **Secret Hygiene:** `JWT_SECRET` must be kept strictly server-side. Never transmit the secret across API responses, log statements, client-side bundles, or Git repositories.

---

## 3. Shared Middleware Usage (Pattern A — Canonical)

The Authentication Module provides shared middleware for authentication and role-based access control (RBAC).

### 3.1 Stable Export Paths
Future ERP modules can import the middleware using either the shared directory or backend middleware export hub:

```javascript
// Preferred canonical path from anywhere in monorepo:
const { verifyToken, requireRole, ALLOWED_ROLES } = require('../../shared/middleware');

// Alternative path directly from backend module:
const { verifyToken, requireRole } = require('../middleware');
```

### 3.2 Zero Side-Effect Guarantee
Importing from `shared/middleware` or `backend/src/middleware`:
* **Does NOT** start the HTTP server.
* **Does NOT** initialize the MySQL database pool.
* **Does NOT** import route controllers or application setup code.
* Performs pure cryptographic in-process token validation using `jsonwebtoken`.

---

## 4. Protected Route Examples

### 4.1 Route Guard Matrix

| Role Constant | Target Users | Allowed Access Scenarios |
|---|---|---|
| `'STUDENT'` | Enrolled students | View personal attendance, grades, class schedules, fee receipts. |
| `'FACULTY'` | Academic staff / teachers | Mark attendance, post assignments, enter student marks. |
| `'ADMIN'` | Institutional administrators | Create courses, configure academic sessions, manage student/faculty records. |

### 4.2 Code Examples for Express Routers

```javascript
/**
 * routes/attendanceRoutes.js
 * Example functional ERP module implementation
 */
'use strict';

const { Router } = require('express');
const { verifyToken, requireRole } = require('../../shared/middleware');
const attendanceController = require('../controllers/attendanceController');

const router = Router();

// 1. STUDENT-only route: Enrolled student viewing their own attendance
router.get(
  '/my-attendance',
  verifyToken,
  requireRole('STUDENT'),
  attendanceController.getMyAttendance
);

// 2. FACULTY-only route: Teacher marking section attendance
router.post(
  '/mark',
  verifyToken,
  requireRole('FACULTY'),
  attendanceController.markAttendance
);

// 3. ADMIN-only route: Department-wide attendance policy configuration
router.put(
  '/policy',
  verifyToken,
  requireRole('ADMIN'),
  attendanceController.updateAttendancePolicy
);

// 4. Combined Staff route: Both Faculty and Admin can inspect course audit summaries
router.get(
  '/course-summary/:courseId',
  verifyToken,
  requireRole('FACULTY', 'ADMIN'),
  attendanceController.getCourseSummary
);

module.exports = router;
```

### 4.3 Reading User Identity in Controllers
When `verifyToken` succeeds, it attaches a sanitized `req.user` object to the Express request:

```javascript
// Example Controller Handler
async function getMyAttendance(req, res, next) {
  try {
    // req.user shape: { id: "103", role: "STUDENT" }
    const studentUserId = req.user.id;
    const userRole = req.user.role;

    // Fetch records using studentUserId as foreign key
    const records = await attendanceService.getRecordsForStudent(studentUserId);

    return res.status(200).json({
      success: true,
      message: 'Attendance records retrieved.',
      data: { records },
      errors: null
    });
  } catch (err) {
    next(err);
  }
}
```

---

## 5. Bearer-Token Handling & Error Contracts

### 5.1 Authorization Header Format
Clients must pass the access token in the standard HTTP `Authorization` header:

```http
Authorization: Bearer <jwt-access-token>
```

### 5.2 HTTP 401 vs HTTP 403 Response Contract

| Error Category | HTTP Status | Trigger Condition | Client Action |
|---|---|---|---|
| **Authentication Failure** | `401 Unauthorized` | Missing Authorization header, invalid Bearer scheme, empty token, expired token, signature tampering, or revoked session. | Attempt token refresh via `POST /api/v1/auth/refresh`. If refresh fails, clear storage and redirect user to `/login`. |
| **Authorization Failure** | `403 Forbidden` | Token is cryptographically valid, but `req.user.role` does not match the roles required by `requireRole(...)`, or user account is deactivated (`is_active = 0`). | Do **NOT** redirect to login. Display an "Access Denied" or permission error notification. |

#### Standard 401 Error Envelope:
```json
{
  "success": false,
  "message": "Token has expired. Please log in again.",
  "data": null,
  "errors": null
}
```

#### Standard 403 Error Envelope:
```json
{
  "success": false,
  "message": "You do not have permission to access this resource.",
  "data": null,
  "errors": null
}
```

---

## 6. Frontend Route Guards vs Server-Side Authorization

A fundamental security principle of the College ERP system is that **frontend route guards and server-side authorization serve entirely different purposes**:

```
+------------------------------------+------------------------------------+
| Frontend Route Guard               | Server-Side Middleware             |
| (ProtectedRoute.jsx)               | (verifyToken & requireRole)        |
+------------------------------------+------------------------------------+
| Purpose: User experience (UX)      | Purpose: Security boundary         |
| Hides unauthorized navigation      | Cryptographically validates token  |
| Prevents flash of restricted UI    | Enforces database & API safety     |
| Can be manipulated in browser DevTools| Cannot be bypassed by client     |
| Never trust for access control     | Sole source of truth               |
+------------------------------------+------------------------------------+
```

### Rule:
Even if a user alters client state to view a restricted page, every background API call will be rejected with `HTTP 401` or `HTTP 403` by the server-side middleware.

---

## 7. Transport Security & CORS Configuration

### 7.1 CORS Policy
When external modules run within the main Express application, CORS is managed by the root Express configuration (`app.js`).
If an ERP module runs as an isolated service communicating with the React client, it must enable CORS with:
* Permitted Origin: React development URL (`http://localhost:5173`) or production college portal domain.
* Allowed Headers: `Content-Type`, `Authorization`, `X-Requested-With`.
* Allowed Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.

### 7.2 HTTPS & Production Deployment
In staging and production environments:
* All communication must use TLS/HTTPS to protect Bearer tokens from intercept/man-in-the-middle attacks.
* HSTS headers (`Strict-Transport-Security`) should be enforced (configured via Helmet).
* Reverse proxies (Nginx/Cloudflare) must pass through the `Authorization` header without stripping or mutating headers.

---

## 8. Step-by-Step Integration Process for Future Modules

Follow these 5 steps when building a new functional module:

1. **Step 1: Choose Route Prefix**
   Mount all module endpoints under a unique versioned prefix (e.g. `/api/v1/attendance` in `backend/src/routes/index.js`).
2. **Step 2: Define MySQL Foreign Keys**
   In the module's migration script, create tables that link back to `users.id`:
   ```sql
   CREATE TABLE student_attendance (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     student_id BIGINT UNSIGNED NOT NULL,
     date DATE NOT NULL,
     status ENUM('PRESENT', 'ABSENT', 'LATE') NOT NULL,
     marked_by BIGINT UNSIGNED NOT NULL,
     CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
     CONSTRAINT fk_att_marker FOREIGN KEY (marked_by) REFERENCES users(id)
   );
   ```
3. **Step 3: Guard Endpoints with Shared Middleware**
   Apply `verifyToken` followed by `requireRole('ADMIN' | 'FACULTY' | 'STUDENT')` on all sensitive routes.
4. **Step 4: Consume `req.user` in Business Logic**
   Use `req.user.id` for row-level permissions (e.g., students can only see their own rows; faculty can only edit courses they teach).
5. **Step 5: Write Integration Tests**
   Write automated regression tests validating that valid tokens succeed, wrong roles receive 403, and unauthenticated requests receive 401.

---

## 9. Remaining Risks & Architectural Considerations

The following items reflect the current implementation state and should be accounted for when deploying to production:

1. **Token Storage in Frontend (`localStorage` vs `HttpOnly` Cookies):**
   * *Current State:* React client stores JWT access and refresh tokens in browser `localStorage`.
   * *Trade-off:* Defends against CSRF attacks by design (Bearer tokens are never attached automatically by browsers), but exposes tokens to JavaScript if an Cross-Site Scripting (XSS) vulnerability exists.
   * *Recommendation:* Future security hardening can migrate refresh tokens to secure `HttpOnly`, `SameSite=Strict` cookies.
2. **Process-Local Rate Limiting:**
   * *Current State:* Rate limiters in `rateLimiter.js` store counters in a process-local memory `Map`.
   * *Trade-off:* Works reliably for single-process deployments. If scaled horizontally across multiple instances or worker clusters, each instance tracks its own bucket.
   * *Recommendation:* Connect rate limiting to a centralized Redis instance for multi-node deployments.
3. **Stateless Access Token Validity Window:**
   * *Current State:* Access tokens expire in 8 hours. When an administrator deactivates an account (`PATCH /admin/users/:id/status`), all refresh token sessions in MySQL are revoked immediately, preventing further token issuance. However, existing stateless access tokens remain cryptographically valid until their 8-hour expiry.
   * *Recommendation:* Shorten `JWT_EXPIRES_IN` to 15–30 minutes in high-security environments, or check account status via a distributed cache blocklist.
4. **SMTP Email Configuration:**
   * *Current State:* Password reset generates secure 256-bit hashes stored in MySQL. Email delivery is stubbed with development logging because production SMTP credentials have not been configured in `backend/.env`.
   * *Recommendation:* Configure production SMTP settings before going live to enable automated email dispatch.
