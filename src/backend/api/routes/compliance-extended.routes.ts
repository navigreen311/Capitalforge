// ============================================================
// CapitalForge — Compliance Extended Routes
//
// Mock-data-backed endpoints for the extended compliance pages:
//   Regulatory Intelligence, Communication Compliance,
//   Training Modules, and Application Decisions.
//
// All routes require authentication (tenantMiddleware).
//
// Endpoints:
//   GET  /api/compliance/regulatory              — regulatory feed
//   GET  /api/compliance/comm-compliance/log      — communication log
//   GET  /api/compliance/comm-compliance/consent-audit — consent audit
//   GET  /api/compliance/training/modules         — training modules
//   POST /api/compliance/training/modules/:id/complete — mark complete
//   GET  /api/compliance/decisions                — decision log
//   GET  /api/compliance/decisions/:id            — decision detail
// ============================================================

import { Router, Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';

export const complianceExtendedRouter = Router();

// ── Auth middleware ──────────────────────────────────────────────
complianceExtendedRouter.use(tenantMiddleware);

// ── Mock Data ───────────────────────────────────────────────────

const REGULATORY_ITEMS = [
  {
    id: 'reg_001',
    title: 'CFPB Issues Updated Guidance on Commercial Credit Disclosures',
    source: 'CFPB',
    date: '2026-04-01',
    summary: 'New guidance requires enhanced APR-equivalent disclosures for all commercial credit products above $100K. Affects all lending and card-stacking advisory workflows.',
    relevance: 'high',
    state: 'Federal',
    regulationType: 'disclosure',
    clientImpact: 'All clients receiving commercial credit offers must now see standardized APR-equivalent disclosures. Update disclosure templates and review all active offers for compliance.',
    bookmarked: false,
  },
  {
    id: 'reg_002',
    title: 'FTC Enforcement Action Against Deceptive Business Credit Marketing',
    source: 'FTC',
    date: '2026-03-28',
    summary: 'FTC settled with a business credit broker for $2.3M over misleading "guaranteed approval" claims. Reinforces need for truthful marketing of credit products.',
    relevance: 'critical',
    state: 'Federal',
    regulationType: 'enforcement',
    clientImpact: 'Review all outbound marketing materials for any guarantee language. Ensure advisors are trained on compliant sales scripts. Audit email and SMS templates.',
    bookmarked: false,
  },
  {
    id: 'reg_003',
    title: 'California SB 1235 Amendment Expands Disclosure Requirements',
    source: 'State AG',
    date: '2026-03-25',
    summary: 'Amendment extends commercial finance disclosure requirements to include factoring and merchant cash advance products under $500K.',
    relevance: 'high',
    state: 'CA',
    regulationType: 'disclosure',
    clientImpact: 'California-based clients with MCA or factoring products need updated disclosure documents. Ensure all CA offers include the new mandated fields.',
    bookmarked: false,
  },
  {
    id: 'reg_004',
    title: 'New York DFS Proposes Commercial Lending Transparency Rule',
    source: 'State AG',
    date: '2026-03-20',
    summary: 'Proposed rule would require commercial lenders to provide standardized cost comparison documents similar to residential mortgage disclosures.',
    relevance: 'medium',
    state: 'NY',
    regulationType: 'proposed_rule',
    clientImpact: 'If finalized, NY-based clients will need cost comparison documents for each product offered. Begin preparing templates now to avoid delays.',
    bookmarked: false,
  },
  {
    id: 'reg_005',
    title: 'FinCEN Updates BSA/AML Requirements for Non-Bank Lenders',
    source: 'CFPB',
    date: '2026-03-15',
    summary: 'New FinCEN guidance clarifies BSA/AML obligations for non-bank commercial lenders including enhanced due diligence requirements for high-risk business categories.',
    relevance: 'high',
    state: 'Federal',
    regulationType: 'aml',
    clientImpact: 'High-risk industry clients (cannabis-adjacent, crypto, money services) require enhanced due diligence. Update KYB workflows for affected businesses.',
    bookmarked: false,
  },
  {
    id: 'reg_006',
    title: 'Texas HB 1442 Business Lending Transparency Act Signed',
    source: 'State AG',
    date: '2026-03-10',
    summary: 'New Texas law requires broker compensation disclosure on all commercial finance transactions. Effective September 1, 2026.',
    relevance: 'medium',
    state: 'TX',
    regulationType: 'disclosure',
    clientImpact: 'Texas clients must receive broker compensation disclosures starting Q3. Update contract templates and advisory fee disclosures for TX transactions.',
    bookmarked: false,
  },
  {
    id: 'reg_007',
    title: 'TCPA Litigation Surge: Auto-Dialer Definition Narrowed',
    source: 'FTC',
    date: '2026-03-05',
    summary: 'Recent circuit court rulings have narrowed the TCPA auto-dialer definition but expanded consent revocation rights. Mixed impact for outbound campaigns.',
    relevance: 'medium',
    state: 'Federal',
    regulationType: 'tcpa',
    clientImpact: 'Outbound call/SMS campaigns may have slightly relaxed dialer rules but must respect any consent revocation immediately. Update consent management workflows.',
    bookmarked: false,
  },
  {
    id: 'reg_008',
    title: 'Florida UDAP Provisions Now Cover Digital Credit Applications',
    source: 'State AG',
    date: '2026-02-28',
    summary: 'Florida expanded its deceptive trade practices statute to explicitly cover AI-assisted and digital credit application flows for commercial products.',
    relevance: 'high',
    state: 'FL',
    regulationType: 'udap',
    clientImpact: 'Florida-based digital application flows must be audited for UDAP compliance. Ensure AI-driven recommendations include clear disclosures about automated decision-making.',
    bookmarked: false,
  },
];

const COMM_LOG = [
  { id: 'cl_001', date: '2026-04-05', type: 'call' as const, business: 'Apex Ventures LLC', summary: 'Discussed Q2 credit line increase options and rate comparison.', flags: [] },
  { id: 'cl_002', date: '2026-04-04', type: 'email' as const, business: 'NovaTech Solutions Inc.', summary: 'Sent product comparison sheet for business credit cards.', flags: ['missing_disclosure'] },
  { id: 'cl_003', date: '2026-04-04', type: 'sms' as const, business: 'Horizon Retail Partners', summary: 'Appointment reminder for portfolio review meeting.', flags: [] },
  { id: 'cl_004', date: '2026-04-03', type: 'call' as const, business: 'Summit Capital Group', summary: 'Cold outreach call — discussed MCA options.', flags: ['banned_claim', 'no_consent'] },
  { id: 'cl_005', date: '2026-04-03', type: 'email' as const, business: 'Blue Ridge Consulting', summary: 'Follow-up on declined application with alternative products.', flags: [] },
  { id: 'cl_006', date: '2026-04-02', type: 'sms' as const, business: 'Crestline Medical LLC', summary: 'Promotional SMS about new credit builder product launch.', flags: ['missing_opt_out'] },
  { id: 'cl_007', date: '2026-04-01', type: 'call' as const, business: 'Pinnacle Logistics', summary: 'Inbound call regarding billing dispute on advisory fee.', flags: [] },
  { id: 'cl_008', date: '2026-04-01', type: 'email' as const, business: 'Summit Capital Group', summary: 'Used phrase "guaranteed approval" in marketing email body.', flags: ['banned_claim'] },
];

const CONSENT_AUDIT = [
  { business: 'Apex Ventures LLC', voice: 'granted', sms: 'granted', email: 'granted', lastUpdated: '2026-03-15' },
  { business: 'NovaTech Solutions Inc.', voice: 'granted', sms: 'revoked', email: 'granted', lastUpdated: '2026-03-20' },
  { business: 'Horizon Retail Partners', voice: 'granted', sms: 'granted', email: 'granted', lastUpdated: '2026-02-10' },
  { business: 'Summit Capital Group', voice: 'not_obtained', sms: 'not_obtained', email: 'granted', lastUpdated: '2026-01-05' },
  { business: 'Blue Ridge Consulting', voice: 'granted', sms: 'granted', email: 'revoked', lastUpdated: '2026-03-28' },
  { business: 'Crestline Medical LLC', voice: 'granted', sms: 'granted', email: 'granted', lastUpdated: '2026-03-01' },
  { business: 'Pinnacle Logistics', voice: 'revoked', sms: 'not_obtained', email: 'granted', lastUpdated: '2026-02-20' },
];

const TRAINING_MODULES = [
  { id: 'tm_001', title: 'TCPA Compliance', description: 'Telephone Consumer Protection Act requirements for outbound calling, texting, and consent management.', durationMin: 45, dueDate: '2026-05-01', renewalMonths: 12, completed: true, completedAt: '2026-02-15', score: 92 },
  { id: 'tm_002', title: 'UDAP Guidelines', description: 'Unfair, Deceptive, or Abusive Acts or Practices — identifying and avoiding UDAP violations in sales and marketing.', durationMin: 60, dueDate: '2026-05-15', renewalMonths: 12, completed: true, completedAt: '2026-01-20', score: 88 },
  { id: 'tm_003', title: 'State Disclosure Laws', description: 'Overview of state-by-state commercial finance disclosure requirements (CA, NY, TX, FL, VA, UT).', durationMin: 90, dueDate: '2026-06-01', renewalMonths: 6, completed: false, completedAt: null, score: null },
  { id: 'tm_004', title: 'Product-Reality Protocol', description: 'Training on accurately representing product features, avoiding guarantee language, and matching client expectations to reality.', durationMin: 30, dueDate: '2026-04-15', renewalMonths: 12, completed: false, completedAt: null, score: null },
  { id: 'tm_005', title: 'AML Basics', description: 'Anti-Money Laundering fundamentals — SAR filing, CDD/EDD, beneficial ownership verification, and red flag identification.', durationMin: 75, dueDate: '2026-07-01', renewalMonths: 12, completed: false, completedAt: null, score: null },
];

const ADVISOR_CERTIFICATIONS = [
  { name: 'Sarah Chen', modules: { tm_001: true, tm_002: true, tm_003: true, tm_004: false, tm_005: false } },
  { name: 'Marcus Johnson', modules: { tm_001: true, tm_002: true, tm_003: false, tm_004: true, tm_005: false } },
  { name: 'Emily Rodriguez', modules: { tm_001: true, tm_002: false, tm_003: false, tm_004: false, tm_005: false } },
  { name: 'David Kim', modules: { tm_001: true, tm_002: true, tm_003: true, tm_004: true, tm_005: true } },
  { name: 'Lisa Thompson', modules: { tm_001: false, tm_002: false, tm_003: false, tm_004: false, tm_005: false } },
];

const DECISIONS = [
  {
    id: 'dec_001', applicationId: 'APP-2026-0142', businessName: 'Apex Ventures LLC', decision: 'approved' as const,
    decisionDate: '2026-04-03', advisor: 'Sarah Chen',
    reasoning: 'Strong credit profile (Dun & Bradstreet PAYDEX 80+), 5+ years in business, annual revenue $2.4M. All KYB/KYC checks passed. Product suitability score 94/100.',
    factors: ['Credit Score: 780', 'Years in Business: 7', 'Annual Revenue: $2.4M', 'Industry Risk: Low', 'PAYDEX: 82'],
    adverseAction: null,
    productType: 'Business Credit Card',
    amount: '$150,000',
  },
  {
    id: 'dec_002', applicationId: 'APP-2026-0143', businessName: 'QuickStart Ventures', decision: 'declined' as const,
    decisionDate: '2026-04-03', advisor: 'Marcus Johnson',
    reasoning: 'Business operational for less than 12 months. Personal credit score below minimum threshold (620). Insufficient revenue history for requested credit amount.',
    factors: ['Credit Score: 580', 'Years in Business: 0.8', 'Annual Revenue: $180K', 'Industry Risk: High', 'PAYDEX: N/A'],
    adverseAction: {
      status: 'sent' as const,
      sentDate: '2026-04-04',
      content: 'Your application for a Business Credit Card has been declined based on the following factors: (1) Insufficient time in business — minimum 12 months required; (2) Personal credit score below minimum threshold; (3) Insufficient annual revenue for requested credit amount. You have the right to request a copy of your credit report and dispute any inaccuracies.',
    },
    productType: 'Business Credit Card',
    amount: '$75,000',
  },
  {
    id: 'dec_003', applicationId: 'APP-2026-0144', businessName: 'NovaTech Solutions Inc.', decision: 'approved' as const,
    decisionDate: '2026-04-02', advisor: 'Emily Rodriguez',
    reasoning: 'Established tech company, 3 years in business. Good credit profile. Revenue growth of 40% YoY. Product suitability for credit line expansion confirmed.',
    factors: ['Credit Score: 720', 'Years in Business: 3', 'Annual Revenue: $1.8M', 'Industry Risk: Medium', 'PAYDEX: 75'],
    adverseAction: null,
    productType: 'Credit Line Increase',
    amount: '$250,000',
  },
  {
    id: 'dec_004', applicationId: 'APP-2026-0145', businessName: 'Harbor Marine Supply', decision: 'declined' as const,
    decisionDate: '2026-04-01', advisor: 'David Kim',
    reasoning: 'Multiple tax liens on record. Existing debt-to-income ratio exceeds threshold. Industry sector flagged for elevated risk (seasonal marine supply).',
    factors: ['Credit Score: 640', 'Years in Business: 12', 'Annual Revenue: $900K', 'Industry Risk: High', 'Tax Liens: 2 active'],
    adverseAction: {
      status: 'pending' as const,
      sentDate: null,
      content: 'Your application for a Merchant Cash Advance has been declined based on the following factors: (1) Active tax liens on business record; (2) Debt-to-income ratio exceeds maximum threshold; (3) Elevated industry risk classification. You have the right to request a copy of your credit report and dispute any inaccuracies.',
    },
    productType: 'Merchant Cash Advance',
    amount: '$200,000',
  },
  {
    id: 'dec_005', applicationId: 'APP-2026-0146', businessName: 'Summit Capital Group', decision: 'approved' as const,
    decisionDate: '2026-03-30', advisor: 'Sarah Chen',
    reasoning: 'Well-capitalized investment firm. Excellent credit history. Low industry risk. Multiple successful prior funding rounds on platform.',
    factors: ['Credit Score: 810', 'Years in Business: 15', 'Annual Revenue: $5.2M', 'Industry Risk: Low', 'PAYDEX: 90'],
    adverseAction: null,
    productType: 'Business Line of Credit',
    amount: '$500,000',
  },
  {
    id: 'dec_006', applicationId: 'APP-2026-0147', businessName: 'GreenLeaf Organics', decision: 'declined' as const,
    decisionDate: '2026-03-29', advisor: 'Marcus Johnson',
    reasoning: 'Cannabis-adjacent industry classification triggers enhanced due diligence. Incomplete beneficial ownership documentation. Unable to verify primary bank relationship.',
    factors: ['Credit Score: 700', 'Years in Business: 2', 'Annual Revenue: $600K', 'Industry Risk: Critical', 'BSA/AML: EDD Required'],
    adverseAction: {
      status: 'sent' as const,
      sentDate: '2026-03-30',
      content: 'Your application for a Business Credit Card has been declined based on the following factors: (1) Industry classification requires enhanced due diligence that could not be completed; (2) Incomplete beneficial ownership documentation; (3) Unable to verify primary banking relationship. You have the right to request a copy of your credit report and dispute any inaccuracies.',
    },
    productType: 'Business Credit Card',
    amount: '$50,000',
  },
];

// ── Regulatory Feed ──────────────────────────────────────────────

complianceExtendedRouter.get('/compliance/regulatory', (_req: Request, res: Response) => {
  const state = (_req.query.state as string) || '';
  const type = (_req.query.type as string) || '';

  let items = [...REGULATORY_ITEMS];
  if (state && state !== 'all') items = items.filter(i => i.state === state);
  if (type && type !== 'all') items = items.filter(i => i.regulationType === type);

  res.json({ success: true, data: items });
});

// ── Communication Log ────────────────────────────────────────────

complianceExtendedRouter.get('/compliance/comm-compliance/log', (_req: Request, res: Response) => {
  res.json({ success: true, data: COMM_LOG });
});

// ── Consent Audit ────────────────────────────────────────────────

complianceExtendedRouter.get('/compliance/comm-compliance/consent-audit', (_req: Request, res: Response) => {
  res.json({ success: true, data: CONSENT_AUDIT });
});

// ── Training Modules ─────────────────────────────────────────────

complianceExtendedRouter.get('/compliance/training/modules', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      modules: TRAINING_MODULES,
      advisors: ADVISOR_CERTIFICATIONS,
    },
  });
});

complianceExtendedRouter.post('/compliance/training/modules/:id/complete', (req: Request, res: Response) => {
  const mod = TRAINING_MODULES.find(m => m.id === req.params.id);
  if (!mod) {
    res.status(404).json({ success: false, error: 'Module not found' });
    return;
  }
  mod.completed = true;
  mod.completedAt = new Date().toISOString();
  mod.score = 100;
  res.json({ success: true, data: mod });
});

// ── Decisions ────────────────────────────────────────────────────

complianceExtendedRouter.get('/compliance/decisions', (req: Request, res: Response) => {
  const filter = (req.query.filter as string) || 'all';
  let items = [...DECISIONS];
  if (filter === 'approved') items = items.filter(d => d.decision === 'approved');
  if (filter === 'declined') items = items.filter(d => d.decision === 'declined');
  res.json({ success: true, data: items });
});

complianceExtendedRouter.get('/compliance/decisions/:id', (req: Request, res: Response) => {
  const decision = DECISIONS.find(d => d.id === req.params.id);
  if (!decision) {
    res.status(404).json({ success: false, error: 'Decision not found' });
    return;
  }
  res.json({ success: true, data: decision });
});
