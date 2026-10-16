# College ERP — Authentication Module

> **Status:** Stage 8 — Logout & Refresh Token Lifecycle verified ✅  
> **Version:** 0.1.0

---

## Purpose

This repository contains the **Authentication Module** of a College ERP system. It is designed as a standalone module that provides secure identity verification and role-based access control (RBAC) for three user roles — **ADMIN**, **FACULTY**, and **STUDENT** — while exposing stable REST APIs that future ERP modules (Attendance, Fees, Examination, Courses, Faculty Management, Student Management) can integrate with seamlessly.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React.js + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | MySQL 8.x |
| API Style | REST · JSON |
| Authentication | JSON Web Tokens (JWT) |
| Authorization | Role-Based Access Control (RBAC) |
| Password Hashing | bcrypt |
| Environment Secrets | dotenv (.env files, never committed) |
| CAPTCHA | Google reCAPTCHA v2 / hCaptcha (Stage 5) |
| Version Control | Git / GitHub (optional, not a prerequisite) |

---

## Prerequisites

Before setting up the project, verify the following are installed:

| Tool | Minimum Version | Notes |
|---|---|---|
| Node.js | 18.x LTS | `node --version` |
| npm | 9.x | Ships with Node |
| MySQL Server | 8.0 | Must be running and accessible |
| MySQL Workbench | Any | Optional GUI client |
| Git | 2.x | Optional for version control |

> **MySQL PATH note:** On Windows, MySQL Server 8.0 may not be on the system `PATH`.  
> Add `C:\Program Files\MySQL\MySQL Server 8.0\bin` to your `PATH` environment variable, or use MySQL Workbench / the full binary path.

---

## Repository Structure

```
college-erp-auth/          ← workspace root (d:\DBMSCIE)
│
├── backend/               ← Express.js API server
│   ├── src/
│   │   ├── config/        ← App config loaders (DB, JWT, CORS, etc.)
│   │   ├── controllers/   ← Route handler functions (thin layer)
│   │   ├── middleware/     ← Express middleware (auth, RBAC, validation, error)
│   │   ├── routes/        ← Express router definitions
│   │   ├── services/      ← Business logic, separated from HTTP layer
│   │   ├── utils/         ← Shared helpers (response builder, token utils)
│   │   ├── validations/   ← Input validation schemas (Joi / express-validator)
│   │   └── db/
│   │       ├── migrations/ ← Schema migration SQL files (numbered, sequential)
│   │       ├── seeds/      ← Seed data SQL (initial admin account)
│   │       ├── procedures/ ← MySQL Stored Procedures (.sql)
│   │       ├── triggers/   ← MySQL Triggers (.sql)
│   │       ├── udfs/       ← MySQL User-Defined Functions (.sql)
│   │       └── views/      ← MySQL Views (.sql)
│   ├── .env.example        ← Environment variable template (safe to commit)
│   └── package.json        ← (created in Stage 2)
│
├── frontend/              ← React.js + Tailwind CSS SPA
│   ├── src/
│   │   ├── assets/        ← Static images, icons, fonts
│   │   ├── components/
│   │   │   ├── common/    ← Reusable UI (Button, Input, Modal, Spinner)
│   │   │   ├── auth/      ← Login form, CAPTCHA widget, ProtectedRoute
│   │   │   ├── admin/     ← Admin-specific components (UserTable, UserForm)
│   │   │   ├── faculty/   ← Faculty-specific components
│   │   │   └── student/   ← Student-specific components
│   │   ├── context/       ← React Context: AuthContext (current user + token)
│   │   ├── hooks/         ← Custom hooks (useAuth, useApi)
│   │   ├── pages/
│   │   │   ├── auth/      ← LoginPage, ForgotPasswordPage, ResetPasswordPage
│   │   │   ├── admin/     ← AdminDashboard, UserManagementPage
│   │   │   ├── faculty/   ← FacultyDashboard
│   │   │   └── student/   ← StudentDashboard
│   │   ├── routes/        ← React Router config + ProtectedRoute guard
│   │   ├── services/      ← Axios API client + auth service calls
│   │   └── utils/         ← Token storage helpers, role constants
│   └── .env.example        ← Frontend env template (safe to commit)
│
├── shared/
│   └── contracts/
│       └── API_CONTRACT.md ← Canonical API routes, response format, JWT shape
│
├── docs/                  ← Architecture diagrams, ADRs, DB design docs
├── .gitignore
├── README.md              ← This file
└── PROJECT_PLAN.md        ← Staged development checklist
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        React SPA (frontend)                  │
│  LoginPage → AuthContext → ProtectedRoute → Role Dashboard  │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS · REST · JSON
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express API Server (backend)               │
│                                                              │
│  Rate Limiter → CORS → Body Parser                          │
│       │                                                      │
│  /api/v1/auth/*    ←── Auth Routes                          │
│  /api/v1/admin/*   ←── Admin Routes (ADMIN only)            │
│       │                                                      │
│  Middleware Chain:                                           │
│    verifyToken → requireRole → Controller → Service          │
│                                                              │
│  Services call DB via mysql2 connection pool                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    MySQL 8.0 Database                        │
│                                                              │
│  Tables · Views · Stored Procedures · Triggers · UDFs       │
└─────────────────────────────────────────────────────────────┘
```

### Inter-Module Integration

Future ERP modules integrate with this module by:

1. **Token verification** — importing `verifyToken` middleware (monorepo) or calling `POST /api/v1/auth/verify-token` (microservice/separate deployment).
2. **User identity** — trusting `req.user.id` (populated by the middleware) as the canonical user foreign key in their own database tables.
3. **Role enforcement** — calling `requireRole('ADMIN')` / `requireRole('FACULTY', 'STUDENT')` from the shared middleware.
4. **Stable API versioning** — the `/api/v1/` prefix will remain backward-compatible; breaking changes will bump to `/api/v2/`.

See [`shared/contracts/API_CONTRACT.md`](./shared/contracts/API_CONTRACT.md) for the full contract specification.

---

## Environment Setup

### Backend
```bash
cd backend

# 1. Copy the environment template
copy .env.example .env       # Windows
# cp .env.example .env       # macOS / Linux

# 2. Edit .env — fill in your real MySQL credentials (DB_USER, DB_PASSWORD)
#    Leave other placeholders for later stages.

# 3. Install dependencies (includes mysql2)
npm install

# 4. [First time only] Create the college_erp database
npm run setup:db

# 5. Run database migrations (creates schema_migrations & users table)
npm run migrate

# 6. Verify database schema and constraints
npm run verify:schema

# 7. Start the development server (auto-restarts on file changes)
npm run dev

# 8. Start in production mode
npm start
```

**Available npm scripts (backend):**

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `nodemon server.js` | Development — auto-restarts on changes |
| `npm start` | `node server.js` | Production startup |
| `npm run setup:db` | `node scripts/setupDb.js` | Create `college_erp` DB (run once after setting credentials) |
| `npm run migrate` | `node scripts/migrate.js` | Run pending database migrations idempotently |
| `npm run verify:schema` | `node scripts/verifySchema.js` | Inspect tables, views, procs, triggers, UDFs, constraints |
| `npm run test:stage5` | `node scripts/testStage5.js` | Automated tests for Stage 5 stored DB objects |
| `npm run test:stage6` | `node --test scripts/testStage6.js` | Automated tests for Stage 6 security foundation (password, JWT, middleware) |
| `npm run test:stage7` | `node --test scripts/testStage7.js` | Automated tests for Stage 7 login API & CAPTCHA verification |
| `npm run test:stage8` | `node --test scripts/testStage8.js` | Automated tests for Stage 8 logout & refresh token lifecycle |

**Health check** (once server is running):
```
GET http://localhost:5000/api/health
```
Expected response includes two separate status fields:
- `data.api.status` — always `"ok"` if the server responds
- `data.database.status` — `"connected"` (with `latency_ms`) or `"disconnected"` / `"unavailable"`

### Frontend
```bash
cd frontend
copy .env.example .env       # Windows
# cp .env.example .env       # macOS / Linux
# Edit .env — fill in API base URL and CAPTCHA site key
npm install          # Stage 3b
npm start            # Stage 3b
```

---


## Development Stages

See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the full staged checklist.

---

## Security Principles

- Passwords are hashed with **bcrypt** (min cost factor 12) — never stored in plaintext.
- JWTs are signed with a secret stored only in environment variables.
- All authorization decisions are enforced **server-side**; frontend route guards are a UX convenience only.
- SQL queries use **parameterized statements** exclusively; no string-concatenated SQL.
- CAPTCHA verification happens **server-side** before any credential check.
- Environment files (`.env`) are listed in `.gitignore` and must never be committed.

---

*College ERP Authentication Module — maintained by the development team.*
