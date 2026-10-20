# Architecture Note — Inter-Module Integration

**Document Type:** Architecture Decision Record (ADR-001)  
**Status:** Completed — Stage 14 API Integration Readiness ✅  
**Scope:** How the Authentication Module exposes stable interfaces for future ERP modules

---

## Context

The College ERP system will eventually consist of multiple functional modules:

| Module | Planned Phase |
|---|---|
| Authentication (this module) | Phase 1 |
| Student Management | Phase 2 |
| Faculty Management | Phase 2 |
| Course Management | Phase 3 |
| Attendance | Phase 3 |
| Examination | Phase 4 |
| Fees | Phase 4 |

Each module must know *who* the currently logged-in user is and *what role* they hold, without re-implementing authentication. The Authentication Module must therefore expose its identity services in a way that is stable, versioned, and decoupled from the internal implementation details.

---

## Integration Patterns

### Pattern A — Shared Middleware (Monorepo / Single Deployment — Canonical Implementation)

When modules run in the same Node.js process / monorepo, they import the shared middleware from `shared/middleware` or `backend/src/middleware`:

```
shared/
  middleware/
    index.js            ← stable re-export hub for cross-module integration
backend/
  src/
    middleware/
      index.js          ← central export hub
      verifyToken.js    ← stateless Bearer JWT verification
      requireRole.js    ← RBAC role enforcement guard
```

Other modules import the middleware directly:

```js
// Example: attendance module route
const { verifyToken, requireRole } = require('../../shared/middleware');

router.get('/attendance/report',
  verifyToken,
  requireRole('FACULTY', 'ADMIN'),
  attendanceController.getReport
);
```

`req.user` is populated by `verifyToken` with `{ id, role }` and is available to all downstream middleware and controllers. User profile details (name, email) can be queried from `vw_user_summary` or `users.id` foreign key.

### Pattern B — Token Verification Endpoint (Separate Deployments / Microservices — Reference Architecture)

When modules are deployed independently:

```
POST /api/v1/auth/verify-token
Headers: Authorization: Bearer <jwt>

Response 200:
{
  "success": true,
  "data": { "id": 42, "role": "FACULTY", "name": "Dr. Sharma" }
}

Response 401:
{
  "success": false,
  "message": "Token expired or invalid"
}
```

Each module calls this endpoint at the start of a protected request and trusts the returned `data` object as the user identity.

---

## API Versioning Strategy

- All routes are prefixed `/api/v1/`.
- The `v1` contract (request shape, response envelope, JWT payload) will not have breaking changes once published.
- Breaking changes will be introduced under `/api/v2/` with a deprecation notice for `v1`.
- Non-breaking additions (new optional fields) may be added to `v1` at any time.

---

## Database Foreign Key Convention

Other modules that store user-related data (e.g., attendance records, fee invoices) must reference `users.id` from the `college_erp_auth` database as a foreign key. They must **not** duplicate user data (name, email, role) in their own tables; they query the Authentication Module's API or the `vw_user_summary` view for display purposes.

```sql
-- Example: Attendance module table (future)
CREATE TABLE attendance (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,  -- FK → college_erp_auth.users.id
  course_id   INT UNSIGNED NOT NULL,
  date        DATE NOT NULL,
  status      ENUM('PRESENT','ABSENT','LATE') NOT NULL,
  recorded_by INT UNSIGNED NOT NULL,  -- FK → college_erp_auth.users.id (FACULTY)
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## What This Module Will NOT Own

To keep the module boundary clean, the Authentication Module does **not** manage:

- Course enrollment or section assignment
- Attendance records
- Grade or examination data
- Fee payment records
- Any faculty-specific academic data

Those concerns live in their respective future modules and reference `users.id` for identity.

---

## Summary

| Concern | Owner |
|---|---|
| Identity (who is logged in) | Authentication Module |
| Role (ADMIN / FACULTY / STUDENT) | Authentication Module |
| Token issuance & validation | Authentication Module |
| Course records | Course Module (future) |
| Attendance records | Attendance Module (future) |
| Fee invoices | Fees Module (future) |
| Grade records | Examination Module (future) |
