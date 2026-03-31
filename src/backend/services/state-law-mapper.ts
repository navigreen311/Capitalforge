// ============================================================
// CapitalForge — State Law Mapper
//
// Returns the disclosure and compliance requirements applicable
// to a commercial financing transaction for a given U.S. state.
//
// Full implementations:
//   - California  (SB 1235 / DFPI)
//   - New York     (NY AG commercial financing rule, 23 NYCRR 600)
//
// Stub implementations for all other 48 states + DC that return
// the federal-floor baseline (FTC Act, TILA where applicable,
// Reg Z) pending state-specific legal review.
//
// IMPORTANT: This module is NOT legal advice. All requirements
// must be reviewed by qualified legal counsel before deployment.
// ============================================================

// ── Types ────────────────────────────────────────────────────────

export type StateCode =
  | 'AL' | 'AK' | 'AZ' | 'AR' | 'CA' | 'CO' | 'CT' | 'DE' | 'DC'
  | 'FL' | 'GA' | 'HI' | 'ID' | 'IL' | 'IN' | 'IA' | 'KS' | 'KY'
  | 'LA' | 'ME' | 'MD' | 'MA' | 'MI' | 'MN' | 'MS' | 'MO' | 'MT'
  | 'NE' | 'NV' | 'NH' | 'NJ' | 'NM' | 'NY' | 'NC' | 'ND' | 'OH'
  | 'OK' | 'OR' | 'PA' | 'RI' | 'SC' | 'SD' | 'TN' | 'TX' | 'UT'
  | 'VT' | 'VA' | 'WA' | 'WV' | 'WI' | 'WY';

export type DisclosureFormat = 'written_before_consummation' | 'verbal_plus_written' | 'electronic_ok' | 'notarised';

export interface RequiredDisclosure {
  /** Short identifier, e.g. "APR_OR_ESTIMATED_APR" */
  id: string;
  label: string;
  description: string;
  /** When must this disclosure be delivered? */
  timing: 'before_application' | 'at_application' | 'before_consummation' | 'at_consummation';
  format: DisclosureFormat[];
  /** Citation: statute, regulation, or official guidance */
  legalCitation: string;
}

export interface ComplianceStep {
  id: string;
  description: string;
  /** Who must perform this step? */
  responsible: 'broker' | 'lender' | 'both';
  legalCitation: string;
}

export interface StateLawProfile {
  stateCode: StateCode;
  stateName: string;
  /** Whether there is a specific commercial financing disclosure law beyond federal baseline */
  hasSpecificStateLaw: boolean;
  /** Short description of the regulatory body and law */
  regulatoryBody: string;
  primaryCitation: string;
  requiredDisclosures: RequiredDisclosure[];
  complianceSteps: ComplianceStep[];
  /** Free-form notes for legal team (e.g. exemptions, thresholds, sunset clauses) */
  notes: string[];
  /** Whether a licensed lender/broker registration is required in this state */
  requiresBrokerLicense: boolean;
  /** If true, new guidance or regulations are pending — re-verify before go-live */
  pendingLegislation: boolean;
}

// ── Federal baseline ─────────────────────────────────────────────
// Applies to all states absent a more specific state law.

const FEDERAL_BASELINE_DISCLOSURES: RequiredDisclosure[] = [
  {
    id: 'FINANCE_CHARGE_TOTAL',
    label: 'Total Finance Charge',
    description:
      'Aggregate dollar cost of the credit, inclusive of all fees, interest, and other charges, ' +
      'expressed clearly and conspicuously.',
    timing: 'before_consummation',
    format: ['written_before_consummation', 'electronic_ok'],
    legalCitation: 'TILA / Reg Z, 15 U.S.C. § 1638; FTC Act § 5',
  },
  {
    id: 'PAYMENT_TERMS',
    label: 'Payment Terms',
    description:
      'Number of payments, frequency, amount per payment, and total repayment amount.',
    timing: 'before_consummation',
    format: ['written_before_consummation', 'electronic_ok'],
    legalCitation: 'Reg Z, 12 C.F.R. § 226.18',
  },
  {
    id: 'PREPAYMENT_PENALTY',
    label: 'Prepayment Penalty Disclosure',
    description:
      'Whether a prepayment penalty applies and the conditions under which it is triggered.',
    timing: 'before_consummation',
    format: ['written_before_consummation', 'electronic_ok'],
    legalCitation: 'TILA / Reg Z; FTC Act § 5',
  },
  {
    id: 'PERSONAL_GUARANTEE',
    label: 'Personal Guarantee Notice',
    description:
      'If a personal guarantee is required, the guarantor must be informed of the personal ' +
      'liability exposure prior to signing.',
    timing: 'before_consummation',
    format: ['written_before_consummation'],
    legalCitation: 'FTC Act § 5 (deception); state guarantee law (varies)',
  },
  {
    id: 'PROGRAM_FEE_DISCLOSURE',
    label: 'Program / Broker Fee Disclosure',
    description:
      'All broker, program, coaching, or facilitation fees must be disclosed separately ' +
      'and not buried in fine print.',
    timing: 'before_application',
    format: ['written_before_consummation', 'electronic_ok'],
    legalCitation: 'FTC Act § 5; Dodd-Frank § 1031 (UDAAP)',
  },
];

const FEDERAL_BASELINE_STEPS: ComplianceStep[] = [
  {
    id: 'VERIFY_ENTITY_TYPE',
    description: 'Confirm the borrower is a legal business entity (not a consumer).',
    responsible: 'broker',
    legalCitation: 'TILA consumer vs. commercial distinction; 15 U.S.C. § 1603',
  },
  {
    id: 'OBTAIN_WRITTEN_CONSENT',
    description:
      'Obtain affirmative written consent before pulling any credit report or submitting any application.',
    responsible: 'broker',
    legalCitation: 'FCRA, 15 U.S.C. § 1681b(a)(3)(F); EFTA § 913',
  },
  {
    id: 'DELIVER_DISCLOSURES',
    description: 'Deliver all required disclosures and retain evidence of delivery.',
    responsible: 'both',
    legalCitation: 'Reg Z; TILA; FTC Act § 5',
  },
  {
    id: 'NO_UDAP_REPRESENTATIONS',
    description:
      'Ensure all verbal and written representations are accurate, substantiated, and non-deceptive.',
    responsible: 'broker',
    legalCitation: 'FTC Act § 5; Dodd-Frank § 1031',
  },
];

// ── California (SB 1235) ─────────────────────────────────────────

const CALIFORNIA: StateLawProfile = {
  stateCode: 'CA',
  stateName: 'California',
  hasSpecificStateLaw: true,
  regulatoryBody:
    'California Department of Financial Protection and Innovation (DFPI) — ' +
    'Senate Bill 1235 (Cal. Fin. Code §§ 22800-22805) effective December 9, 2022',
  primaryCitation: 'Cal. Fin. Code §§ 22800–22805 (SB 1235); 10 CCR §§ 900–972',
  requiredDisclosures: [
    ...FEDERAL_BASELINE_DISCLOSURES,
    {
      id: 'CA_SB1235_ESTIMATED_APR',
      label: 'Estimated APR (SB 1235)',
      description:
        'DFPI-prescribed estimated annual percentage rate (APR) or estimated annual cost of ' +
        'financing, expressed as a percentage and calculated using the method specified by DFPI ' +
        'regulation. Applies to commercial financing ≤ $500,000.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'Cal. Fin. Code § 22803 (SB 1235); 10 CCR § 910',
    },
    {
      id: 'CA_SB1235_FINANCE_CHARGE',
      label: 'Finance Charge — Dollar Amount (SB 1235)',
      description:
        'Total dollar amount of all charges payable to the provider that are not included ' +
        'in the disbursement amount, expressed in a standardised DFPI disclosure form.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'Cal. Fin. Code § 22803(b); 10 CCR § 912',
    },
    {
      id: 'CA_SB1235_PREPAYMENT_TERMS',
      label: 'Prepayment — Specific SB 1235 Disclosure',
      description:
        'Whether there is a prepayment penalty, and if so: the amount or how it is calculated, ' +
        'expressed in the DFPI standard disclosure table.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'Cal. Fin. Code § 22803(d)',
    },
    {
      id: 'CA_SB1235_COLLATERAL',
      label: 'Collateral Description (SB 1235)',
      description:
        'Any collateral required to obtain the commercial financing must be described. ' +
        'For credit-card stacking, state "none" or describe any blanket lien.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'Cal. Fin. Code § 22803(e)',
    },
    {
      id: 'CA_DFPI_BROKER_REGISTRATION',
      label: 'DFPI Commercial Financing Provider Registration',
      description:
        'Providers and brokers arranging commercial financing in California must register ' +
        'with the DFPI and maintain registration annually.',
      timing: 'before_application',
      format: ['written_before_consummation'],
      legalCitation: 'Cal. Fin. Code § 22802; 10 CCR § 902',
    },
  ],
  complianceSteps: [
    ...FEDERAL_BASELINE_STEPS,
    {
      id: 'CA_DFPI_REGISTRATION_CHECK',
      description:
        'Confirm provider/broker DFPI commercial financing registration is active before ' +
        'arranging any transaction ≤ $500,000.',
      responsible: 'broker',
      legalCitation: 'Cal. Fin. Code § 22802',
    },
    {
      id: 'CA_USE_DFPI_DISCLOSURE_FORM',
      description:
        'Use the DFPI-prescribed standard disclosure form (or DFPI-approved equivalent). ' +
        'Custom forms must be pre-approved by DFPI.',
      responsible: 'both',
      legalCitation: '10 CCR § 910–920',
    },
    {
      id: 'CA_OBTAIN_SIGNED_ACKNOWLEDGMENT',
      description:
        'Obtain signed (electronic or wet) acknowledgment that the borrower received and ' +
        'reviewed the SB 1235 disclosure before proceeding.',
      responsible: 'broker',
      legalCitation: 'Cal. Fin. Code § 22804',
    },
    {
      id: 'CA_RECORD_RETENTION_4YR',
      description:
        'Retain all SB 1235 disclosures and signed acknowledgments for a minimum of 4 years.',
      responsible: 'both',
      legalCitation: '10 CCR § 935',
    },
  ],
  notes: [
    'SB 1235 exempts transactions > $500,000 from the APR disclosure requirement.',
    'Credit cards (revolving plans) may be partially exempt if the issuer provides a Schumer Box — confirm with counsel.',
    'DFPI may issue enforcement actions including disgorgement, penalties up to $10,000/violation.',
    'Pending: DFPI may expand SB 1235 to larger transaction sizes; re-verify annually.',
  ],
  requiresBrokerLicense: true,
  pendingLegislation: false,
};

// ── New York ──────────────────────────────────────────────────────

const NEW_YORK: StateLawProfile = {
  stateCode: 'NY',
  stateName: 'New York',
  hasSpecificStateLaw: true,
  regulatoryBody:
    'New York Department of Financial Services (DFS) / Attorney General — ' +
    'Commercial Finance Disclosure Law (CFDL), N.Y. Fin. Serv. Law § 801-811, ' +
    'effective August 1, 2023',
  primaryCitation: 'N.Y. Fin. Serv. Law §§ 801-811; 3 NYCRR Part 600',
  requiredDisclosures: [
    ...FEDERAL_BASELINE_DISCLOSURES,
    {
      id: 'NY_CFDL_ESTIMATED_APR',
      label: 'Estimated APR (NY CFDL)',
      description:
        'NY DFS-prescribed estimated APR calculated per DFS methodology. ' +
        'Must use the DFS-approved formula for sales-based or fixed-payment products.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'N.Y. Fin. Serv. Law § 804(1); 3 NYCRR § 600.4',
    },
    {
      id: 'NY_CFDL_TOTAL_COST',
      label: 'Total Cost of Capital (NY CFDL)',
      description:
        'Aggregate dollar cost expressed as a dollar amount, separate from the disbursement amount.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'N.Y. Fin. Serv. Law § 804(2)',
    },
    {
      id: 'NY_CFDL_PAYMENT_SCHEDULE',
      label: 'Payment Schedule (NY CFDL)',
      description:
        'Detailed payment schedule including frequency, amount, and all conditions that could ' +
        'alter scheduled payments (e.g. ACH debit variability).',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'N.Y. Fin. Serv. Law § 804(3)',
    },
    {
      id: 'NY_CFDL_RENEWAL_OFFER',
      label: 'Renewal / Refinancing Terms (NY CFDL)',
      description:
        'If renewal or refinancing is offered as part of the product, all fees and ' +
        'conditions of renewal must be disclosed upfront.',
      timing: 'before_consummation',
      format: ['written_before_consummation', 'electronic_ok'],
      legalCitation: 'N.Y. Fin. Serv. Law § 804(5)',
    },
  ],
  complianceSteps: [
    ...FEDERAL_BASELINE_STEPS,
    {
      id: 'NY_DFS_REGISTRATION',
      description:
        'Register with the NY DFS as a commercial financing provider or broker prior to ' +
        'arranging any commercial financing for NY-domiciled businesses.',
      responsible: 'broker',
      legalCitation: 'N.Y. Fin. Serv. Law § 802',
    },
    {
      id: 'NY_USE_DFS_DISCLOSURE_FORM',
      description:
        'Use the DFS-prescribed disclosure form or a DFS-approved substantially equivalent form.',
      responsible: 'both',
      legalCitation: '3 NYCRR § 600.3',
    },
    {
      id: 'NY_AG_ANTI_FRAUD_CHECK',
      description:
        'NY AG has independent enforcement authority for deceptive trade practices under ' +
        'GBL § 349. Ensure all representations comply — separate from DFS oversight.',
      responsible: 'broker',
      legalCitation: 'N.Y. Gen. Bus. Law § 349',
    },
    {
      id: 'NY_RECORD_RETENTION_3YR',
      description:
        'Retain disclosure records and acknowledgments for a minimum of 3 years.',
      responsible: 'both',
      legalCitation: '3 NYCRR § 600.7',
    },
  ],
  notes: [
    'CFDL applies to commercial financing ≤ $2,500,000 offered to NY businesses.',
    'NY AG (General Business Law § 349) enforcement is independent of DFS — dual exposure.',
    'Credit card issuers regulated as national banks may be exempt; consult counsel on card-specific products.',
    'DFS may impose penalties up to $2,000 per violation per day.',
    'Pending: NY is considering expanding CFDL thresholds — monitor NY DFS guidance.',
  ],
  requiresBrokerLicense: true,
  pendingLegislation: true,
};

// ── States with emerging specific laws ───────────────────────────

const VIRGINIA: Partial<StateLawProfile> & Pick<StateLawProfile, 'stateCode' | 'stateName' | 'primaryCitation'> = {
  stateCode: 'VA',
  stateName: 'Virginia',
  primaryCitation: 'Va. Code § 6.2-312 et seq.; HB 1027 (2022) — effective July 1, 2022',
};

const UTAH: Partial<StateLawProfile> & Pick<StateLawProfile, 'stateCode' | 'stateName' | 'primaryCitation'> = {
  stateCode: 'UT',
  stateName: 'Utah',
  primaryCitation: 'Utah S.B. 183 (2023) — commercial financing disclosure; eff. May 3, 2023',
};

// ── Generic stub builder ──────────────────────────────────────────

function buildStubProfile(
  code: StateCode,
  name: string,
  extra?: Partial<StateLawProfile>,
): StateLawProfile {
  return {
    stateCode: code,
    stateName: name,
    hasSpecificStateLaw: false,
    regulatoryBody: 'State Attorney General / UDAP statute + federal baseline',
    primaryCitation: 'FTC Act § 5; Dodd-Frank § 1031 (UDAAP)',
    requiredDisclosures: FEDERAL_BASELINE_DISCLOSURES,
    complianceSteps: FEDERAL_BASELINE_STEPS,
    notes: [
      'No state-specific commercial financing disclosure law identified as of March 2026.',
      'Federal baseline (TILA/Reg Z where applicable, FTC Act § 5) applies.',
      'State UDAP statute may impose additional duties — consult local counsel.',
      'STUB: This profile requires legal review before production use.',
    ],
    requiresBrokerLicense: false,
    pendingLegislation: false,
    ...extra,
  };
}

// ── State registry ────────────────────────────────────────────────

const STATE_REGISTRY: Record<StateCode, StateLawProfile> = {
  CA: CALIFORNIA,
  NY: NEW_YORK,
  VA: buildStubProfile('VA', 'Virginia', {
    hasSpecificStateLaw: true,
    primaryCitation: VIRGINIA.primaryCitation,
    notes: [
      'Virginia enacted commercial financing disclosure requirements in 2022 (HB 1027).',
      'Review Va. Code § 6.2-312 et seq. for specific APR disclosure format requirements.',
      'STUB: Full implementation pending legal review.',
    ],
    pendingLegislation: false,
  }),
  UT: buildStubProfile('UT', 'Utah', {
    hasSpecificStateLaw: true,
    primaryCitation: UTAH.primaryCitation,
    notes: [
      'Utah S.B. 183 (2023) introduced commercial financing disclosure requirements.',
      'STUB: Full implementation pending legal review.',
    ],
    pendingLegislation: false,
  }),
  AL: buildStubProfile('AL', 'Alabama'),
  AK: buildStubProfile('AK', 'Alaska'),
  AZ: buildStubProfile('AZ', 'Arizona'),
  AR: buildStubProfile('AR', 'Arkansas'),
  CO: buildStubProfile('CO', 'Colorado'),
  CT: buildStubProfile('CT', 'Connecticut'),
  DE: buildStubProfile('DE', 'Delaware'),
  DC: buildStubProfile('DC', 'District of Columbia'),
  FL: buildStubProfile('FL', 'Florida'),
  GA: buildStubProfile('GA', 'Georgia'),
  HI: buildStubProfile('HI', 'Hawaii'),
  ID: buildStubProfile('ID', 'Idaho'),
  IL: buildStubProfile('IL', 'Illinois'),
  IN: buildStubProfile('IN', 'Indiana'),
  IA: buildStubProfile('IA', 'Iowa'),
  KS: buildStubProfile('KS', 'Kansas'),
  KY: buildStubProfile('KY', 'Kentucky'),
  LA: buildStubProfile('LA', 'Louisiana'),
  ME: buildStubProfile('ME', 'Maine'),
  MD: buildStubProfile('MD', 'Maryland'),
  MA: buildStubProfile('MA', 'Massachusetts'),
  MI: buildStubProfile('MI', 'Michigan'),
  MN: buildStubProfile('MN', 'Minnesota'),
  MS: buildStubProfile('MS', 'Mississippi'),
  MO: buildStubProfile('MO', 'Missouri'),
  MT: buildStubProfile('MT', 'Montana'),
  NE: buildStubProfile('NE', 'Nebraska'),
  NV: buildStubProfile('NV', 'Nevada'),
  NH: buildStubProfile('NH', 'New Hampshire'),
  NJ: buildStubProfile('NJ', 'New Jersey'),
  NM: buildStubProfile('NM', 'New Mexico'),
  NC: buildStubProfile('NC', 'North Carolina'),
  ND: buildStubProfile('ND', 'North Dakota'),
  OH: buildStubProfile('OH', 'Ohio'),
  OK: buildStubProfile('OK', 'Oklahoma'),
  OR: buildStubProfile('OR', 'Oregon'),
  PA: buildStubProfile('PA', 'Pennsylvania'),
  RI: buildStubProfile('RI', 'Rhode Island'),
  SC: buildStubProfile('SC', 'South Carolina'),
  SD: buildStubProfile('SD', 'South Dakota'),
  TN: buildStubProfile('TN', 'Tennessee'),
  TX: buildStubProfile('TX', 'Texas'),
  VT: buildStubProfile('VT', 'Vermont'),
  WA: buildStubProfile('WA', 'Washington'),
  WV: buildStubProfile('WV', 'West Virginia'),
  WI: buildStubProfile('WI', 'Wisconsin'),
  WY: buildStubProfile('WY', 'Wyoming'),
};

// ── Public API ────────────────────────────────────────────────────

/**
 * Retrieve the full compliance profile for a given state.
 * Returns `null` if the state code is not recognised.
 */
export function getStateLawProfile(stateCode: string): StateLawProfile | null {
  const upper = stateCode.trim().toUpperCase() as StateCode;
  return STATE_REGISTRY[upper] ?? null;
}

/**
 * Returns only the required disclosures for a state.
 * Useful when building disclosure packets before an interaction.
 */
export function getRequiredDisclosures(stateCode: string): RequiredDisclosure[] {
  return getStateLawProfile(stateCode)?.requiredDisclosures ?? FEDERAL_BASELINE_DISCLOSURES;
}

/**
 * Returns only the compliance steps for a state.
 */
export function getComplianceSteps(stateCode: string): ComplianceStep[] {
  return getStateLawProfile(stateCode)?.complianceSteps ?? FEDERAL_BASELINE_STEPS;
}

/**
 * Returns true when the state has enacted a specific commercial financing disclosure law
 * beyond the federal baseline.
 */
export function hasSpecificStateLaw(stateCode: string): boolean {
  return getStateLawProfile(stateCode)?.hasSpecificStateLaw ?? false;
}

/**
 * Returns all states that have specific laws — useful for monitoring dashboards.
 */
export function getStatesWithSpecificLaws(): StateCode[] {
  return (Object.keys(STATE_REGISTRY) as StateCode[]).filter(
    (code) => STATE_REGISTRY[code].hasSpecificStateLaw,
  );
}
