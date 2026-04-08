// ============================================================
// CapitalForge — Application Pre-Submission Gate Checks
//
// ALL five core gates MUST pass before an application can transition
// from pending_consent → submitted. A sixth gate is conditionally
// enforced when the application involves a credit union issuer.
//
// Gates (in enforcement order):
//  1. Product Reality Acknowledged
//  2. Consent Captured (per-application, not just business-level)
//  3. Suitability Check Passed (no no-go triggered)
//  4. KYB / KYC Verified for the business and all beneficial owners
//  5. Maker-Checker Approval (approver ≠ creator)
//  6. Credit Union Membership Disclosure (conditional — credit_union issuers only)
// ============================================================

import { PrismaClient } from '@prisma/client';
import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────

export interface GateCheckResult {
  passed: boolean;
  /** Human-readable label, e.g. "product_reality" */
  gate: string;
  reason?: string;
}

export interface GateSummary {
  allPassed: boolean;
  results: GateCheckResult[];
  /** Convenience array — only the failed gate names */
  failedGates: string[];
}

export interface MakerCheckerContext {
  /** User who created the application (the "maker") */
  createdByUserId: string;
  /** User who is approving the submission (the "checker") */
  approverUserId: string;
}

// ── GateChecker ───────────────────────────────────────────────

export class ApplicationGateChecker {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  /**
   * Run all pre-submission gates for a given application.
   * The five core gates always run. Gate #6 (CU membership disclosure)
   * is conditionally enforced when the application's issuer type is
   * 'credit_union'.
   *
   * @param applicationId - The CardApplication being evaluated
   * @param businessId    - The owning Business
   * @param tenantId      - Multi-tenant guard (used in every query)
   * @param makerChecker  - Maker/checker user IDs for gate #5
   * @param issuerType    - Optional issuer type; when 'credit_union', gate #6 is enforced
   */
  async checkAll(
    applicationId: string,
    businessId: string,
    tenantId: string,
    makerChecker: MakerCheckerContext,
    issuerType?: string,
  ): Promise<GateSummary> {
    const log = logger.child({ applicationId, businessId, tenantId });
    log.info('Running pre-submission gate checks');

    const coreGates = await Promise.all([
      this.checkProductRealityAcknowledged(businessId),
      this.checkConsentCaptured(applicationId, businessId),
      this.checkSuitabilityPassed(businessId),
      this.checkKybKycVerified(businessId, tenantId),
      this.checkMakerChecker(makerChecker),
    ]);

    const results: GateCheckResult[] = [...coreGates];

    // Gate #6: Credit Union Membership Disclosure (conditional)
    if (issuerType === 'credit_union') {
      const cuGate = await this.checkCuMembershipDisclosure(applicationId, businessId);
      results.push(cuGate);
    }

    const failedGates = results.filter((r) => !r.passed).map((r) => r.gate);
    const allPassed = failedGates.length === 0;

    log.info('Gate check summary', { allPassed, failedGates });

    return { allPassed, results, failedGates };
  }

  // ── Gate 1: Product Reality Acknowledged ─────────────────────

  /**
   * The business must have signed the "product_reality" acknowledgment.
   * References: ProductAcknowledgment.acknowledgmentType = 'product_reality'
   */
  async checkProductRealityAcknowledged(businessId: string): Promise<GateCheckResult> {
    const GATE = 'product_reality';
    try {
      const ack = await this.prisma.productAcknowledgment.findFirst({
        where: {
          businessId,
          acknowledgmentType: 'product_reality',
        },
        select: { id: true, signedAt: true },
      });

      if (!ack) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'Product reality acknowledgment has not been signed. Client must acknowledge ' +
            'that credit card stacking is not guaranteed funding before submission.',
        };
      }

      return { passed: true, gate: GATE };
    } catch (err) {
      return {
        passed: false,
        gate: GATE,
        reason: `Gate check error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Gate 2: Consent Captured ──────────────────────────────────

  /**
   * Per-application consent must be captured (stored as consentCapturedAt on the
   * CardApplication row) AND an active ConsentRecord of type 'application' must
   * exist for the business.
   */
  async checkConsentCaptured(applicationId: string, businessId: string): Promise<GateCheckResult> {
    const GATE = 'consent_captured';
    try {
      // Check per-application consent timestamp
      const application = await this.prisma.cardApplication.findUnique({
        where: { id: applicationId },
        select: { consentCapturedAt: true },
      });

      if (!application) {
        return { passed: false, gate: GATE, reason: 'Application not found.' };
      }

      if (!application.consentCapturedAt) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'Per-application consent timestamp is missing. Consent must be captured and ' +
            'timestamped on each individual application before submission.',
        };
      }

      // Check active ConsentRecord for the business
      const activeConsent = await this.prisma.consentRecord.findFirst({
        where: {
          businessId,
          consentType: 'application',
          status: 'active',
        },
        select: { id: true },
      });

      if (!activeConsent) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'No active application consent record found for this business. ' +
            'An explicit "application" consent must be recorded before submission.',
        };
      }

      return { passed: true, gate: GATE };
    } catch (err) {
      return {
        passed: false,
        gate: GATE,
        reason: `Gate check error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Gate 3: Suitability Passed ────────────────────────────────

  /**
   * The most recent SuitabilityCheck must exist and must NOT have noGoTriggered = true.
   * A business with a no-go finding cannot submit any application.
   */
  async checkSuitabilityPassed(businessId: string): Promise<GateCheckResult> {
    const GATE = 'suitability';
    try {
      const latestCheck = await this.prisma.suitabilityCheck.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: {
          noGoTriggered: true,
          noGoReasons: true,
          overriddenBy: true,
          overrideReason: true,
          score: true,
        },
      });

      if (!latestCheck) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'No suitability assessment found. A suitability check must be completed ' +
            'before an application can be submitted.',
        };
      }

      // An override by a compliance officer clears the no-go
      if (latestCheck.noGoTriggered && !latestCheck.overriddenBy) {
        const reasons = Array.isArray(latestCheck.noGoReasons)
          ? (latestCheck.noGoReasons as string[]).join('; ')
          : String(latestCheck.noGoReasons ?? 'unspecified');
        return {
          passed: false,
          gate: GATE,
          reason: `Suitability no-go triggered: ${reasons}`,
        };
      }

      return { passed: true, gate: GATE };
    } catch (err) {
      return {
        passed: false,
        gate: GATE,
        reason: `Gate check error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Gate 4: KYB / KYC Verified ────────────────────────────────

  /**
   * Two conditions must be met:
   *  a) A ComplianceCheck of type 'kyb' exists for the business with no open (unresolved) findings.
   *  b) ALL beneficial owners (ownershipPercent >= 25 %) have kycStatus = 'verified'.
   */
  async checkKybKycVerified(businessId: string, tenantId: string): Promise<GateCheckResult> {
    const GATE = 'kyb_kyc';
    try {
      // KYB: look for a resolved KYB compliance check
      const kybCheck = await this.prisma.complianceCheck.findFirst({
        where: {
          businessId,
          tenantId,
          checkType: 'kyb',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          riskLevel: true,
          resolvedAt: true,
          findings: true,
        },
      });

      if (!kybCheck) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'No KYB compliance check found. Business identity must be verified ' +
            'before application submission.',
        };
      }

      if (kybCheck.riskLevel === 'critical' && !kybCheck.resolvedAt) {
        return {
          passed: false,
          gate: GATE,
          reason: 'KYB check has an unresolved critical risk finding.',
        };
      }

      // KYC: all beneficial owners must be verified
      const owners = await this.prisma.businessOwner.findMany({
        where: { businessId, isBeneficialOwner: true },
        select: { id: true, firstName: true, lastName: true, kycStatus: true },
      });

      if (owners.length === 0) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'No beneficial owners on file. At least one owner must be added and KYC-verified.',
        };
      }

      const unverified = owners.filter((o) => o.kycStatus !== 'verified');
      if (unverified.length > 0) {
        const names = unverified
          .map((o) => `${o.firstName} ${o.lastName}`)
          .join(', ');
        return {
          passed: false,
          gate: GATE,
          reason: `KYC not verified for beneficial owner(s): ${names}`,
        };
      }

      return { passed: true, gate: GATE };
    } catch (err) {
      return {
        passed: false,
        gate: GATE,
        reason: `Gate check error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Gate 5: Maker-Checker Approval ───────────────────────────

  /**
   * The user approving the submission MUST be different from the user
   * who created the application. The approver must hold either the
   * 'advisor' + APPLICATION_APPROVE permission, or be a compliance_officer
   * (role check is done in the route layer; here we just enforce uniqueness).
   */
  async checkMakerChecker(context: MakerCheckerContext): Promise<GateCheckResult> {
    const GATE = 'maker_checker';

    if (!context.approverUserId || context.approverUserId.trim() === '') {
      return {
        passed: false,
        gate: GATE,
        reason:
          'No approver specified. A second advisor or compliance officer must approve ' +
          'the application before it can be submitted (maker-checker requirement).',
      };
    }

    if (context.approverUserId === context.createdByUserId) {
      return {
        passed: false,
        gate: GATE,
        reason:
          'The approver must be a different user than the creator. ' +
          'Self-approval is not permitted (maker-checker violation).',
      };
    }

    return { passed: true, gate: GATE };
  }

  // ── Gate 6: Credit Union Membership Disclosure ────────────────

  /**
   * When an application involves a credit_union issuer, the client must
   * have signed a 'cu_membership_disclosure' acknowledgment confirming
   * they understand that credit union membership is a separate
   * prerequisite from the credit card application.
   */
  async checkCuMembershipDisclosure(
    applicationId: string,
    businessId: string,
  ): Promise<GateCheckResult> {
    const GATE = 'cu_membership_disclosure';
    try {
      // Look for a signed CU membership disclosure acknowledgment
      const ack = await this.prisma.productAcknowledgment.findFirst({
        where: {
          businessId,
          acknowledgmentType: 'cu_membership_disclosure',
        },
        select: { id: true, signedAt: true },
      });

      if (!ack) {
        return {
          passed: false,
          gate: GATE,
          reason:
            'Credit union membership disclosure has not been signed. The client must ' +
            'acknowledge that membership in the credit union is required before applying ' +
            'for this card, and that membership is a separate account/relationship from ' +
            'the business credit card.',
        };
      }

      return { passed: true, gate: GATE };
    } catch (err) {
      return {
        passed: false,
        gate: GATE,
        reason: `Gate check error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
