// ============================================================
// Route Aggregator
// Mounts all feature route modules under /api.
// Add new route modules here — do NOT register them in server.ts.
// ============================================================

import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import authRouter from './auth.routes.js';
import { createAcknowledgmentRouter } from './acknowledgment.routes.js';
import { onboardingRouter } from './onboarding.routes.js';
import { optimizerRouter } from './optimizer.routes.js';
import { kybKycRouter } from './kyb-kyc.routes.js';
import applicationRouter from './application.routes.js';
import { suitabilityRouter } from './suitability.routes.js';
import { costCalculatorRouter } from './cost-calculator.routes.js';

export const apiRouter = Router();

// ── Health (public — no auth required) ───────────────────────
apiRouter.use('/health', healthRouter);

// ── Auth (public — login, register, refresh, logout) ─────────
apiRouter.use('/auth', authRouter);

// ── Onboarding & Business Profile Engine ─────────────────────
apiRouter.use('/businesses', onboardingRouter);

// ── Acknowledgments (compliance gate — must be mounted before applications) ──
apiRouter.use('/businesses/:id/acknowledgments', createAcknowledgmentRouter());

// ── KYB / KYC Verification ───────────────────────────────────
// POST   /api/businesses/:id/verify/kyb
// POST   /api/businesses/:id/verify/kyc/:ownerId
// GET    /api/businesses/:id/verification-status
apiRouter.use('/businesses', kybKycRouter);

// ── Application Pipeline & Workflow Manager ───────────────────
// POST   /api/businesses/:id/applications
// GET    /api/businesses/:id/applications
// GET    /api/applications/:id
// PUT    /api/applications/:id/status
apiRouter.use('/', applicationRouter);

// ── Suitability & No-Go Engine ────────────────────────────────
// POST /api/businesses/:id/suitability/check
// GET  /api/businesses/:id/suitability/latest
// POST /api/businesses/:id/suitability/override
apiRouter.use('/businesses/:id/suitability', suitabilityRouter);

// ── Cost of Capital Calculator ────────────────────────────────
// POST /api/businesses/:id/cost/calculate
// GET  /api/businesses/:id/cost/latest
// POST /api/businesses/:id/cost/compare
apiRouter.use('/businesses/:id/cost', costCalculatorRouter);

// ── Card Stacking Optimizer ───────────────────────────────────
// POST   /api/businesses/:id/optimize
// GET    /api/businesses/:id/optimizer/results
// POST   /api/businesses/:id/optimizer/simulate
apiRouter.use('/businesses/:id/optimize', optimizerRouter);
apiRouter.use('/businesses/:id/optimizer', optimizerRouter);

// ── Document Vault ────────────────────────────────────────────
// POST   /api/businesses/:id/documents          — upload
// GET    /api/businesses/:id/documents          — list with filters
// GET    /api/documents/export/:businessId      — compliance dossier
// GET    /api/documents/:id                     — retrieve + presigned URL
// PUT    /api/documents/:id/legal-hold          — toggle legal hold
// DELETE /api/documents/:id                     — delete (blocked on hold)
import { documentRouter } from './document.routes.js';
apiRouter.use('/', documentRouter);

// ── Compliance & Risk Center ──────────────────────────────────
// GET  /api/businesses/:id/compliance/risk-score
// POST /api/businesses/:id/compliance/check
// GET  /api/compliance/state-laws/:state
// GET  /api/compliance/vendor-history/:vendorId
import { complianceRouter } from './compliance.routes.js';
apiRouter.use('/', complianceRouter);

// ── Future route modules ──────────────────────────────────────
// import { fundingRouter }     from './funding.routes.js';
// import { consentRouter }     from './consent.routes.js';
// import { achRouter }         from './ach.routes.js';
// import { creditRouter }      from './credit.routes.js';
// import { adminRouter }       from './admin.routes.js';

// apiRouter.use('/funding',     fundingRouter);
// apiRouter.use('/consent',     consentRouter);
// apiRouter.use('/ach',         achRouter);
// apiRouter.use('/credit',      creditRouter);
// apiRouter.use('/admin',       adminRouter);
