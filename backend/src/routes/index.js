/**
 * backend/src/routes/index.js
 *
 * Root API router — mounts all sub-routers under versioned prefixes.
 *
 * Current Stage (2): only /api/health is active.
 * Future routers are imported and mounted here as they are built:
 *
 *   Stage 4:  authRoutes    → /api/v1/auth
 *   Stage 6:  adminRoutes   → /api/v1/admin
 *   Stage 14: additional ERP module routers under /api/v1/...
 *
 * Keeping the mounting logic here (rather than in app.js) means app.js
 * stays clean and this file becomes the single source of truth for
 * all API route registrations.
 */

'use strict';

const { Router } = require('express');
const healthRoutes = require('./healthRoutes');

const router = Router();

// ── Health check (no versioning — infrastructure concern, not a business API) ─
router.use('/health', healthRoutes);

// ── Version 1 Routes ──────────────────────────────────────────────────────────
const authRoutes = require('./authRoutes');
router.use('/v1/auth', authRoutes);

const adminRoutes = require('./adminRoutes');
router.use('/v1/admin', adminRoutes);

module.exports = router;
