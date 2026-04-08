// ============================================================
// CapitalForge Disclosures, Complaints & Regulatory Mock Data
// ============================================================
// Mock data for disclosure templates, consumer complaints,
// and regulatory dashboard endpoints.
// Activate via NEXT_PUBLIC_USE_MOCK_DATA=true in .env.local
// ============================================================

// ── Date helpers ───────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Disclosure Templates ──────────────────────────────────────────────────
// Consumed by: DisclosureTemplateManager

const MOCK_DISCLOSURE_TEMPLATES = {
  templates: [
    {
      id: 'tmpl_001',
      name: 'Standard APR Disclosure',
      state: 'Federal',
      category: 'APR',
      version: 'v3.2',
      status: 'approved' as const,
      last_modified: daysFromNow(-12),
      content:
        'This disclosure provides the Annual Percentage Rate (APR) applicable to your commercial financing agreement. The APR reflects the total cost of credit expressed as an annualized rate, including all fees and charges required by the Truth in Lending Act (TILA).',
      versions: [
        { version: 'v3.2', date: daysFromNow(-12), author: 'Sarah Chen', status: 'approved' as const },
        { version: 'v3.1', date: daysFromNow(-45), author: 'Marcus Reid', status: 'archived' as const },
        { version: 'v3.0', date: daysFromNow(-120), author: 'Sarah Chen', status: 'archived' as const },
      ],
    },
    {
      id: 'tmpl_002',
      name: 'CA SB 1235',
      state: 'CA',
      category: 'State Commercial Financing',
      version: 'v2.1',
      status: 'approved' as const,
      last_modified: daysFromNow(-8),
      content:
        'Pursuant to California Senate Bill 1235, this disclosure sets forth the total cost of the commercial financing transaction, including the total dollar cost, the annual percentage rate, the term, and the payment amounts required under the agreement.',
      versions: [
        { version: 'v2.1', date: daysFromNow(-8), author: 'Olivia Torres', status: 'approved' as const },
        { version: 'v2.0', date: daysFromNow(-90), author: 'Olivia Torres', status: 'archived' as const },
      ],
    },
    {
      id: 'tmpl_003',
      name: 'ECOA Rights Notice',
      state: 'Federal',
      category: 'Equal Credit',
      version: 'v1.3',
      status: 'approved' as const,
      last_modified: daysFromNow(-30),
      content:
        'Under the Equal Credit Opportunity Act (ECOA), it is unlawful to discriminate in any aspect of a credit transaction on the basis of race, color, religion, national origin, sex, marital status, age, or because all or part of the applicant\'s income derives from any public assistance program.',
      versions: [
        { version: 'v1.3', date: daysFromNow(-30), author: 'James Park', status: 'approved' as const },
        { version: 'v1.2', date: daysFromNow(-180), author: 'James Park', status: 'archived' as const },
        { version: 'v1.1', date: daysFromNow(-365), author: 'Sarah Chen', status: 'archived' as const },
      ],
    },
    {
      id: 'tmpl_004',
      name: 'TILA Disclosure',
      state: 'Federal',
      category: 'Truth in Lending',
      version: 'v1.0',
      status: 'pending_approval' as const,
      last_modified: daysFromNow(-2),
      content:
        'This Truth in Lending Act disclosure statement provides the finance charge, annual percentage rate, amount financed, and total of payments for the credit transaction as required by Regulation Z, ensuring the borrower receives clear and standardized cost information.',
      versions: [
        { version: 'v1.0', date: daysFromNow(-2), author: 'Marcus Reid', status: 'pending_approval' as const },
      ],
    },
    {
      id: 'tmpl_005',
      name: 'UDAAP Statement',
      state: 'Federal',
      category: 'Consumer Protection',
      version: 'v2.0',
      status: 'deprecated' as const,
      last_modified: daysFromNow(-60),
      content:
        'This statement outlines the institution\'s commitment to avoiding unfair, deceptive, or abusive acts or practices (UDAAP) in the origination and servicing of commercial credit products, in compliance with Dodd-Frank Act Section 1031.',
      versions: [
        { version: 'v2.0', date: daysFromNow(-60), author: 'Olivia Torres', status: 'deprecated' as const },
        { version: 'v1.0', date: daysFromNow(-300), author: 'Sarah Chen', status: 'archived' as const },
      ],
    },
    {
      id: 'tmpl_006',
      name: 'Credit Union Membership Disclosure',
      state: 'Federal',
      category: 'CU Membership',
      version: 'v1.0',
      status: 'approved' as const,
      last_modified: daysFromNow(-5),
      content:
        'This disclosure informs the client that the business credit card they are applying for is issued by a credit union and that membership in the credit union is required before the application can be processed. Membership is a separate account/relationship from the business credit card. The disclosure covers membership eligibility requirements, associated fees, NCUA deposit insurance, and the fact that membership approval does not guarantee credit card approval.',
      versions: [
        { version: 'v1.0', date: daysFromNow(-5), author: 'Sarah Chen', status: 'approved' as const },
      ],
      applicableTo: ['credit_union'],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Complaints ────────────────────────────────────────────────────────────
// Consumed by: ComplaintTracker

const MOCK_COMPLAINTS = {
  complaints: [
    {
      id: 'CMP-001',
      client: 'Meridian Holdings LLC',
      category: 'Billing',
      severity: 'High' as const,
      status: 'Open' as const,
      submitted: daysFromNow(-3),
      description: 'Client reports being charged a processing fee that was not disclosed in the original financing agreement. Fee appeared on the March statement without prior notification.',
      root_cause: 'Fee schedule update was not communicated to the client prior to billing cycle.',
      response_due: daysFromNow(4),
      evidence: [
        { name: 'March Statement.pdf', uploaded: daysFromNow(-3), size: '245 KB' },
        { name: 'Original Agreement.pdf', uploaded: daysFromNow(-2), size: '1.2 MB' },
      ],
      timeline: [
        { date: daysFromNow(-3), event: 'Complaint received via client portal', actor: 'System' },
        { date: daysFromNow(-2), event: 'Assigned to compliance team for review', actor: 'Sarah Chen' },
        { date: daysFromNow(-1), event: 'Fee schedule discrepancy confirmed', actor: 'Marcus Reid' },
      ],
    },
    {
      id: 'CMP-002',
      client: 'Apex Ventures Inc.',
      category: 'Fair Lending',
      severity: 'Critical' as const,
      status: 'Escalated' as const,
      submitted: daysFromNow(-7),
      description: 'Client alleges disparate treatment in credit limit assignment compared to similarly situated applicants. Requests full review of underwriting criteria applied to their application.',
      root_cause: 'Under investigation — pending comparative analysis of peer applications.',
      response_due: daysFromNow(1),
      evidence: [
        { name: 'Application Record.pdf', uploaded: daysFromNow(-7), size: '890 KB' },
        { name: 'Peer Comparison Request.docx', uploaded: daysFromNow(-5), size: '156 KB' },
        { name: 'Underwriting Model Output.xlsx', uploaded: daysFromNow(-4), size: '340 KB' },
      ],
      timeline: [
        { date: daysFromNow(-7), event: 'Complaint filed by client counsel', actor: 'External' },
        { date: daysFromNow(-6), event: 'Escalated to Chief Compliance Officer', actor: 'Olivia Torres' },
        { date: daysFromNow(-5), event: 'Comparative analysis initiated', actor: 'James Park' },
        { date: daysFromNow(-3), event: 'External legal review engaged', actor: 'Olivia Torres' },
      ],
    },
    {
      id: 'CMP-003',
      client: 'Brightline Corp',
      category: 'Disclosure',
      severity: 'Medium' as const,
      status: 'In Review' as const,
      submitted: daysFromNow(-5),
      description: 'Client states the APR disclosure provided at closing did not match the APR quoted during the application process. Discrepancy of 0.75% between quoted and disclosed rate.',
      root_cause: 'Rate lock expired before closing; updated rate was applied but disclosure language was not updated to reflect the change.',
      response_due: daysFromNow(9),
      evidence: [
        { name: 'Rate Lock Confirmation.pdf', uploaded: daysFromNow(-5), size: '120 KB' },
        { name: 'Closing Disclosure.pdf', uploaded: daysFromNow(-4), size: '350 KB' },
      ],
      timeline: [
        { date: daysFromNow(-5), event: 'Complaint submitted via email', actor: 'System' },
        { date: daysFromNow(-4), event: 'Documentation collected from loan file', actor: 'Marcus Reid' },
        { date: daysFromNow(-2), event: 'Rate lock expiration confirmed as root cause', actor: 'James Park' },
      ],
    },
    {
      id: 'CMP-004',
      client: 'Thornwood Capital',
      category: 'Advisor Conduct',
      severity: 'Low' as const,
      status: 'Resolved' as const,
      submitted: daysFromNow(-21),
      description: 'Client reports that an advisor made verbal promises about fee waivers that were not reflected in the final agreement. Client requests documentation of all advisor communications.',
      root_cause: 'Advisor deviated from approved script during outreach call. Call recording confirmed unauthorized verbal commitment.',
      response_due: daysFromNow(-7),
      evidence: [
        { name: 'Call Recording.mp3', uploaded: daysFromNow(-20), size: '8.5 MB' },
        { name: 'Script Deviation Report.pdf', uploaded: daysFromNow(-18), size: '95 KB' },
      ],
      timeline: [
        { date: daysFromNow(-21), event: 'Complaint received via phone', actor: 'System' },
        { date: daysFromNow(-20), event: 'Call recording retrieved and reviewed', actor: 'Sarah Chen' },
        { date: daysFromNow(-18), event: 'Script deviation confirmed; advisor counseled', actor: 'Olivia Torres' },
        { date: daysFromNow(-14), event: 'Fee waiver honored as goodwill gesture', actor: 'Marcus Reid' },
        { date: daysFromNow(-10), event: 'Client acknowledged resolution', actor: 'External' },
        { date: daysFromNow(-7), event: 'Complaint closed', actor: 'Sarah Chen' },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Regulatory Dashboard ──────────────────────────────────────────────────
// Consumed by: RegulatoryDashboard

const MOCK_REGULATORY_DASHBOARD = {
  alerts: [
    {
      id: 'alert_001',
      source: 'CFPB',
      type: 'UDAP',
      severity: 'critical' as const,
      status: 'new' as const,
      title: 'CFPB Issues Updated UDAP Examination Procedures',
      description:
        'The CFPB released revised examination procedures for UDAP compliance effective Q2 2026. Updated procedures include enhanced scrutiny of fee disclosure practices and digital marketing materials.',
      published: daysFromNow(-2),
      action_required: 'Review updated examination procedures and update internal compliance checklists by end of quarter.',
    },
    {
      id: 'alert_002',
      source: 'FDIC',
      type: 'Enforcement',
      severity: 'high' as const,
      status: 'reviewed' as const,
      title: 'FDIC Consent Order: Commercial Lending Disclosure Deficiencies',
      description:
        'FDIC issued a consent order against a peer institution for inadequate commercial financing disclosures. The order highlights deficiencies in APR calculation methodology and fee transparency.',
      published: daysFromNow(-10),
      action_required: 'Conduct internal audit of APR calculation methodology and compare against enforcement findings.',
    },
    {
      id: 'alert_003',
      source: 'State Legislature',
      type: 'New Regulation',
      severity: 'medium' as const,
      status: 'actioned' as const,
      title: 'Illinois Commercial Financing Disclosure Act — Effective July 2026',
      description:
        'Illinois enacted the Commercial Financing Disclosure Act requiring standardized disclosures for commercial financing transactions over $50,000. Implementation required by July 1, 2026.',
      published: daysFromNow(-30),
      action_required: 'Develop IL-specific disclosure templates and update onboarding workflows for Illinois-based clients.',
    },
  ],
  aml_readiness: [
    { category: 'Customer Due Diligence', score: 92, max: 100 },
    { category: 'Transaction Monitoring', score: 87, max: 100 },
    { category: 'Suspicious Activity Reporting', score: 95, max: 100 },
    { category: 'Sanctions Screening', score: 78, max: 100 },
    { category: 'Record Keeping', score: 88, max: 100 },
  ],
  funds_flow: [
    { id: 'flow_001', source: 'Operating Account', destination: 'Client Trust', amount: 250000, flagged: false, date: daysFromNow(-1) },
    { id: 'flow_002', source: 'Client Trust', destination: 'Card Issuer (Chase)', amount: 87500, flagged: false, date: daysFromNow(-1) },
    { id: 'flow_003', source: 'External Transfer', destination: 'Operating Account', amount: 175000, flagged: true, flag_reason: 'Large inbound transfer from new counterparty — requires enhanced due diligence review', date: daysFromNow(-2) },
    { id: 'flow_004', source: 'Operating Account', destination: 'Offshore Intermediary', amount: 62000, flagged: true, flag_reason: 'Transfer to jurisdiction with elevated AML risk — manual approval required', date: daysFromNow(-3) },
  ],
  licensing: [
    { state: 'CA', status: 'active' as const, license_number: 'CFL-2024-0891', expiry: daysFromNow(240), renewal_due: daysFromNow(180) },
    { state: 'NY', status: 'active' as const, license_number: 'NYSL-2025-1134', expiry: daysFromNow(310), renewal_due: daysFromNow(250) },
    { state: 'IL', status: 'expired' as const, license_number: 'ILCF-2023-0445', expiry: daysFromNow(-15), renewal_due: daysFromNow(-75) },
    { state: 'TX', status: 'pending' as const, license_number: null, expiry: null, renewal_due: null },
  ],
  last_updated: new Date().toISOString(),
};

// ── Public accessor ───────────────────────────────────────────────────────

export function getDiscCompRegMockData(endpoint: string): unknown | null {
  if (endpoint.includes('disclosures/templates') || endpoint.includes('disclosures/list')) {
    return MOCK_DISCLOSURE_TEMPLATES;
  }

  if (endpoint.includes('/complaints')) {
    return MOCK_COMPLAINTS;
  }

  if (endpoint.includes('/regulatory/dashboard') || endpoint.includes('/regulatory/alerts') || endpoint.includes('/regulatory/overview')) {
    return MOCK_REGULATORY_DASHBOARD;
  }

  return null;
}
