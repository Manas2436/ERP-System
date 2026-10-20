# College ERP — Authentication Module

> **Status:** Stage 16 — Documentation & Final Review Complete ✅  
> **Release:** v1.0.0  

---

## 1. Executive Summary

This repository contains the production-ready **Authentication & Identity Management Module** for the College ERP ecosystem. It serves as the authoritative identity and role-based access control (RBAC) provider for all institutional stakeholders across three standardized tiers:

- **`ADMIN`**: Campus system administrators responsible for provisioning accounts, updating user statuses, modifying roles, and inspecting audit trails.
- **`FACULTY`**: Academic and teaching staff accessing academic management, grading, and departmental features.
- **`STUDENT`**: Enrolled students accessing course enrollments, attendance, schedules, and grade records.

---

## 2. Institutional Access & Closed Registration Policy

> [!IMPORTANT]
> **No Public Signup or Self-Registration:**
> Self-registration is strictly disabled across both the frontend and backend. There is no public user registration endpoint (`POST /api/v1/auth/register` does not exist).
> All user accounts are provisioned exclusively by authorized administrators holding the `ADMIN` role via `POST /api/v1/admin/users`.
> 
> The client login page displays an explicit institutional banner informing users that self-registration is unavailable.

---

## 3. Technology Stack

| Layer | Component | Version | Purpose |
|---|---|---|---|
| **Frontend** | React | `18.3.1` | Single-Page Application (SPA) with route guards |
| **Styling** | Tailwind CSS | `3.4.17` | Responsive institutional UI components |
| **Build Tool** | Vite | `6.0.3` | Fast bundling and development server |
| **Icons** | Lucide React | `0.468.0` | Accessible iconography |
| **Backend** | Node.js / Express | `5.3.0` | Pure JSON REST API with security middleware |
| **Database** | MySQL | `8.0` | Relational storage with InnoDB constraints |
| **DB Driver** | mysql2/promise | `3.24.6` | Async connection pool with parameterized queries |
| **Authentication** | jsonwebtoken | `9.0.2` | Cryptographically signed HS256 tokens |
| **Password Hashing** | bcryptjs | `3.0.2` | Salted credential hashing (cost factor 10–14) |
| **Security Headers** | Helmet | `8.3.0` | Protection against sniffing, framing, and clickjacking |
| **Testing** | Jest + Supertest | `30.5.2` / `7.3.1` | Backend unit and integration test runners |
| **Frontend Testing** | Vitest + RTL | `2.1.8` / `16.1.0` | React component and lifecycle testing |

---

## 4. Repository Structure

```text
college-erp-auth/
├── backend/
│   ├── scripts/               # Migration runner, schema verification, regression scripts
│   ├── src/
│   │   ├── config/            # Typed env loader, MySQL connection pool
│   │   ├── controllers/       # authController, adminController
│   │   ├── db/                # SQL migrations, stored procedures, triggers, views, UDFs
│   │   ├── middleware/        # verifyToken, requireRole, rateLimiter, errorHandler, notFound
│   │   ├── routes/            # authRoutes, adminRoutes, healthRoutes
│   │   ├── services/          # authService, adminService, captchaService, dbHealthService
│   │   ├── utils/             # jwt, password, logger, responseBuilder
│   │   └── validations/       # authValidation, adminValidation, prototype pollution defense
│   ├── tests/
│   │   ├── unit/              # Jest unit tests (services, utils, validations, middleware)
│   │   └── integration/       # Supertest suites (auth, admin, rbac, e2eFlow)
│   ├── server.js              # HTTP server entry point with graceful shutdown
│   └── package.json           # v1.0.0
├── frontend/
│   ├── src/
│   │   ├── components/        # Alert, Button, Input, Navbar, CaptchaBox, ProtectedRoute
│   │   ├── context/           # AuthContext managing user session and token refresh
│   │   ├── pages/             # LoginPage, ForgotPasswordPage, ResetPasswordPage, Dashboards
│   │   ├── routes/            # AppRouter configuring public/protected route guards
│   │   ├── services/          # apiClient (Axios with 401 refresh queue), authService
│   │   └── __tests__/         # Vitest test suites (LoginPage, LoginForm, ProtectedRoute, etc.)
│   └── package.json           # v1.0.0
├── shared/
│   ├── contracts/             # Canonical API_CONTRACT.md (single source of truth)
│   └── middleware/            # Reusable verifyToken and requireRole for future ERP modules
├── docs/
│   ├── ARCHITECTURE_NOTE.md   # ADR records & design decisions
│   ├── DATABASE_DESIGN.md     # Detailed ER diagram, tables, procedures, views, UDFs
│   ├── E2E_TEST_PLAN.md       # Full end-to-end user lifecycle test plan
│   ├── INTEGRATION_GUIDE.md   # Step-by-step guide for future ERP module authors
│   └── SECURITY.md            # OWASP Top 10 threat model & security policies
├── PROJECT_PLAN.md            # Staged progression checklist (Stages 1 through 16)
└── README.md                  # This file
```

---

## 5. Quick Start & Environment Setup

### 5.1 Prerequisites
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher
- **MySQL Server:** v8.0 or higher running on port 3306
- **Git:** 2.x (optional)

### 5.2 Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Configure environment variables:**
   Copy `backend/.env.example` to `backend/.env`:
   ```bash
   copy .env.example .env
   ```
   *Update the MySQL credentials (`DB_USER`, `DB_PASSWORD`, `DB_NAME`) to match your local MySQL instance.*

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Initialize the database:**
   ```bash
   npm run setup:db        # Creates college_erp database if absent
   npm run migrate         # Applies all schema migrations, procedures, views, triggers
   npm run verify:schema   # Inspects and verifies tables, views, procedures, UDFs, triggers
   ```

5. **Start backend server:**
   ```bash
   npm run dev             # Starts with nodemon on port 5000
   # OR for production:
   npm start               # Starts with standard node on port 5000
   ```

### 5.3 Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Configure environment variables:**
   Copy `frontend/.env.example` to `frontend/.env`:
   ```bash
   copy .env.example .env
   ```
   *(Ensure `VITE_API_BASE_URL=http://localhost:5000/api/v1` is configured).*

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the development server:**
   ```bash
   npm run dev             # Starts Vite on http://localhost:5173
   ```

5. **Build for production:**
   ```bash
   npm run build           # Creates optimized bundle in frontend/dist
   ```

---

## 6. Testing & Quality Assurance

### 6.1 Backend Test Suites (Jest & Supertest)

```bash
cd backend

# Run all 71 unit tests (services, utils, validations, middleware)
npm run test:unit

# Run all 49 HTTP integration tests (auth, admin, rbac, e2eFlow)
npm run test:integration

# Run full Stage 15 verification (all 120 tests across 12 test suites)
npm run test:stage15

# Run individual stage regressions (Node built-in test runner)
npm run test:stage5    # Stored procedures, triggers, views, UDFs (52 assertions)
npm run test:stage6    # Bcrypt, JWT, password utilities, middleware (40 tests)
npm run test:stage7    # Login, CAPTCHA, timing defense, lockout (26 tests)
npm run test:stage8    # Refresh token single-use rotation & logout (19 tests)
npm run test:stage9    # Forgot password, reset password, anti-enumeration (35 tests)
npm run test:stage12   # Admin user management & RBAC guards (30 tests)
npm run test:stage13   # Security hardening, headers, mass assignment (24 tests)
npm run test:stage14   # Shared middleware & cross-module simulation (27 tests)
```

### 6.2 Frontend Test Suites (Vitest & RTL)

```bash
cd frontend

# Run all 33 React component and lifecycle tests
npm test

# Build production bundle
npm run build
```

---

## 7. Authentication, Sessions & Security Behavior

### 7.1 Arithmetic CAPTCHA Defense
- Clients must solve a single-use arithmetic challenge (`GET /api/v1/auth/captcha`) before logging in.
- The challenge is consumed immediately upon submission, preventing replay attacks.
- Incorrect CAPTCHA answers reject the request prior to invoking database credential lookups.

### 7.2 Account Lockout Policy
- 5 consecutive failed login attempts automatically lock the account for 15 minutes (`locked_until`).
- Further attempts return HTTP 423 Locked with timing-attack mitigations.
- Successful authentication resets the counter to 0 and updates `last_login_at`.

### 7.3 Token Lifecycle & Silent Rotation
- **Access Token:** Short-lived (default: 8 hours), signed with HS256, carrying `{ sub: userId, role: 'ADMIN'|'FACULTY'|'STUDENT' }`.
- **Refresh Token:** Long-lived (7 days), stored as a SHA-256 hash in MySQL `refresh_tokens`.
- **Atomic Single-Use Rotation:** Every refresh request issues a new token and revokes the old one (`replaced_by_token_hash`).
- **Replay Protection:** Submitting an already-revoked refresh token immediately returns HTTP 401 and rejects session renewal.
- **Transparent Frontend Interceptor:** Axios response interceptor coordinates in-flight refresh requests using an internal queue, retrying pending requests seamlessly.

### 7.4 Forgot & Reset Password Flow
- **Anti-Enumeration:** `POST /api/v1/auth/forgot-password` returns the exact same generic response whether an account exists, does not exist, or is deactivated.
- **Cryptographic Reset Tokens:** 256-bit cryptographically secure tokens (`crypto.randomBytes(32)`), stored strictly as SHA-256 hashes with 15-minute expiration.
- **Session Revocation:** Resetting a password automatically revokes all active refresh-token sessions across all devices in MySQL.

---

## 8. Cross-Module ERP Integration

Future ERP functional modules (e.g., Attendance, Courses, Examination, Fees) consume authentication via the shared middleware:

```javascript
// Canonical monorepo import path
const { verifyToken, requireRole, ALLOWED_ROLES } = require('../../shared/middleware');

// Protect student-facing endpoint
router.get('/student/grades', verifyToken, requireRole('STUDENT'), getGrades);

// Protect staff-facing endpoint (Faculty + Admin)
router.get('/faculty/course-roster', verifyToken, requireRole('ADMIN', 'FACULTY'), getRoster);
```

For complete integration guidelines, see [docs/INTEGRATION_GUIDE.md](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/docs/INTEGRATION_GUIDE.md) and [shared/contracts/API_CONTRACT.md](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/shared/contracts/API_CONTRACT.md).

---

## 9. Known Limitations & Operational Considerations

1. **SMTP Email Delivery:**
   - Password reset tokens are generated and stored strictly as SHA-256 hashes in MySQL. Real password reset emails are not dispatched because SMTP credentials have not been configured in `backend/.env`. Password reset tokens are retrieved only via dev hooks during testing.
2. **Process-Local Rate Limiting:**
   - Rate limiters store request sliding-window counts in process memory (`Map`). For multi-node cluster deployments, a distributed Redis store must be configured.
3. **Stateless Access Token Natural Expiry:**
   - Deactivating an account revokes all refresh tokens in MySQL immediately. Existing stateless access tokens expire after their natural 8-hour lifetime unless an in-process revocation blocklist is implemented.
4. **Token Storage in `localStorage`:**
   - The React client stores tokens in browser `localStorage`. This eliminates CSRF vulnerabilities by design. For production environments with strict XSS isolation requirements, migrating refresh tokens to `HttpOnly`, `SameSite=Strict` cookies can be evaluated.

---

## 10. Technical Documentation Index

- [Database Design & ER Diagram](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/docs/DATABASE_DESIGN.md)
- [Inter-Module Integration Guide](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/docs/INTEGRATION_GUIDE.md)
- [Security Policy & Threat Model](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/docs/SECURITY.md)
- [End-to-End Test Plan](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/docs/E2E_TEST_PLAN.md)
- [Canonical Shared API Contract](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/shared/contracts/API_CONTRACT.md)
- [Project Plan & Progress Checklist](file:///d:/ERP-System-Authentication-Nidhi-Mohit-Netal/PROJECT_PLAN.md)

---

*College ERP Authentication Module v1.0.0 — Verified and Maintained by the Development Team.*
