# Authentication and password reset

The Authentication branch's login security behavior and password-reset lifecycle are integrated into the ERP's existing `/api/auth` contract. `app_user` remains the only identity table, so `student_id` and `faculty_id` links, role checks, JWT claims, and existing ERP routes keep their current meaning. Google reCAPTCHA v2 remains required for login.

## Reset flow

1. `POST /api/auth/forgot-password` accepts `identifier` (username or registered email). It is rate limited and returns the same generic `202` response for unknown, inactive, and eligible accounts.
2. For an active account, the API generates a 256-bit random token, stores only its SHA-256 digest in `password_reset_tokens`, and expires it after `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` (default 15). A new request invalidates earlier outstanding tokens.
3. If SMTP is configured, a one-time reset link is emailed. In non-production environments, loopback-only `GET /api/auth/dev-reset-token/:identifier` can retrieve the latest token for local/manual testing; this endpoint is not registered in production. The frontend does not use it or reveal whether an account matched.
4. `POST /api/auth/reset-password` accepts `token`, `newPassword`, and optional `confirmPassword`. The transaction checks expiry and unused status, updates the bcrypt password hash, clears login lockout, consumes the token, and revokes all active refresh tokens. Invalid, expired, and reused tokens are rejected.

## Email configuration

For real delivery configure these backend environment variables (never in `frontend/.env`):

- `SMTP_HOST` (defaults to `smtp.gmail.com`)
- `SMTP_PORT` (defaults to `465`)
- `SMTP_SECURE` (`true` for implicit TLS; defaults based on port 465)
- `SMTP_USER`
- `SMTP_PASSWORD` (use a provider app password where required)
- `EMAIL_FROM` (optional; defaults to a University ERP sender using `SMTP_USER`)
- `FRONTEND_URL` (optional; defaults to `http://localhost:5175`, used to build reset links)
- `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` (optional; defaults to 15 and is bounded to 5–60 minutes)

When running locally without SMTP, submit the generic request, then manually retrieve the token from the development-only endpoint and open `/reset-password?token=...`. Production requires SMTP credentials; the forgot-password endpoint returns an actionable `503` if they are absent.

## Existing database upgrade

Fresh schema builds create `refresh_tokens` and `password_reset_tokens` from `database/01_auth/schema.sql`. To upgrade an existing database without dropping or rebuilding it, apply `database/01_auth/migrations/001_password_reset_tokens.sql` to `college_erp` with the configured MySQL credentials. It creates either table only if missing and leaves existing rows intact. Do not use `database/run_all.sh` for this upgrade; that script drops and recreates the database.
