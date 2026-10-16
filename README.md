# College ERP — Authentication Module

> **Status:** Stage 8 — Logout & Refresh Token Lifecycle verified ✅
> **Version:** 0.1.0

## Purpose

This repository contains the Authentication Module of a College ERP system. It provides secure identity verification and role-based access control (RBAC) for ADMIN, FACULTY, and STUDENT roles, with REST APIs for future ERP modules.

## Technology Stack

| Layer               | Technology                       |
| ------------------- | -------------------------------- |
| Frontend            | React.js + Tailwind CSS          |
| Backend             | Node.js + Express.js             |
| Database            | MySQL 8.x                        |
| API Style           | REST · JSON                      |
| Authentication      | JSON Web Tokens (JWT)            |
| Authorization       | Role-Based Access Control (RBAC) |
| Password Hashing    | bcrypt                           |
| Environment Secrets | dotenv                           |
| CAPTCHA             | Google reCAPTCHA v2 / hCaptcha   |
| Version Control     | Git / GitHub                     |

## Prerequisites

* Node.js 18.x or later
* npm 9.x or later
* MySQL Server 8.0
* MySQL Workbench (optional)
* Git 2.x (optional)

## Repository Structure

```text
college-erp-auth/
├── backend/
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       ├── utils/
│       ├── validations/
│       └── db/
├── frontend/
│   └── src/
│       ├── assets/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── pages/
│       ├── routes/
│       ├── services/
│       └── utils/
├── shared/
│   └── contracts/
├── docs/
├── .gitignore
├── README.md
└── PROJECT_PLAN.md
```

## Environment Setup

### Backend

```bash
cd backend
copy .env.example .env
npm install
npm run setup:db
npm run migrate
npm run verify:schema
npm run dev
```

Configure the MySQL credentials in `backend/.env` before running the database commands.

### Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm start
```

Configure the API base URL and CAPTCHA site key in `frontend/.env`.

## Health Check

Once the backend server is running, check:

```text
GET http://localhost:5000/api/health
```

The response reports API and database status separately.

## Security Principles

* Passwords are hashed with bcrypt.
* JWT secrets are stored in environment variables.
* Authorization is enforced server-side.
* SQL queries use parameterized statements.
* CAPTCHA verification happens server-side.
* `.env` files must never be committed.

## Development Stages

See `PROJECT_PLAN.md` for the staged development checklist.

---

*College ERP Authentication Module — maintained by the development team.*
