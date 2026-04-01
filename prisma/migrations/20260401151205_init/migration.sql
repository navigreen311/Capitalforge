-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandConfig" JSONB,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'advisor',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "advisorId" TEXT,
    "legalName" TEXT NOT NULL,
    "dba" TEXT,
    "ein" TEXT,
    "entityType" TEXT NOT NULL,
    "stateOfFormation" TEXT,
    "dateOfFormation" DATETIME,
    "mcc" TEXT,
    "industry" TEXT,
    "annualRevenue" DECIMAL,
    "monthlyRevenue" DECIMAL,
    "fundingReadinessScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'intake',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "businesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "businesses_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "business_owners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "ownershipPercent" DECIMAL NOT NULL,
    "ssn" TEXT,
    "dateOfBirth" DATETIME,
    "address" JSONB,
    "isBeneficialOwner" BOOLEAN NOT NULL DEFAULT true,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "kycVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "business_owners_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "credit_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "profileType" TEXT NOT NULL,
    "bureau" TEXT NOT NULL,
    "score" INTEGER,
    "scoreType" TEXT,
    "utilization" DECIMAL,
    "inquiryCount" INTEGER,
    "derogatoryCount" INTEGER,
    "tradelines" JSONB,
    "rawData" JSONB,
    "pulledAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_profiles_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "funding_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "targetCredit" DECIMAL,
    "targetCardCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "aprExpiryDate" DATETIME,
    "alertSent60" BOOLEAN NOT NULL DEFAULT false,
    "alertSent30" BOOLEAN NOT NULL DEFAULT false,
    "alertSent15" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "funding_rounds_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "card_applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "fundingRoundId" TEXT,
    "issuer" TEXT NOT NULL,
    "cardProduct" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "creditLimit" DECIMAL,
    "introApr" DECIMAL,
    "introAprExpiry" DATETIME,
    "regularApr" DECIMAL,
    "annualFee" DECIMAL,
    "cashAdvanceFee" DECIMAL,
    "consentCapturedAt" DATETIME,
    "submittedAt" DATETIME,
    "decidedAt" DATETIME,
    "declineReason" TEXT,
    "adverseActionNotice" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "card_applications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "card_applications_fundingRoundId_fkey" FOREIGN KEY ("fundingRoundId") REFERENCES "funding_rounds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "suitability_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxSafeLeverage" DECIMAL,
    "recommendation" TEXT NOT NULL,
    "noGoTriggered" BOOLEAN NOT NULL DEFAULT false,
    "noGoReasons" JSONB,
    "alternativeProducts" JSONB,
    "decisionExplanation" TEXT,
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suitability_checks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "channel" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "revocationReason" TEXT,
    "ipAddress" TEXT,
    "evidenceRef" TEXT,
    "metadata" JSONB,
    CONSTRAINT "consent_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "consent_records_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_acknowledgments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "acknowledgmentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL,
    "signatureRef" TEXT,
    "documentVaultId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_acknowledgments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "compliance_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "checkType" TEXT NOT NULL,
    "riskScore" INTEGER,
    "riskLevel" TEXT,
    "findings" JSONB,
    "stateJurisdiction" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compliance_checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "compliance_checks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ach_authorizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "processorName" TEXT NOT NULL,
    "authorizedAmount" DECIMAL,
    "authorizedFrequency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "signedDocumentRef" TEXT,
    "authorizedAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "revocationNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ach_authorizations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "debit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorizationId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "frequency" TEXT,
    "isWithinTolerance" BOOLEAN NOT NULL DEFAULT true,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "processedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "debit_events_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "ach_authorizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cost_calculations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "programFees" DECIMAL NOT NULL DEFAULT 0,
    "percentOfFunding" DECIMAL NOT NULL DEFAULT 0,
    "annualFees" DECIMAL NOT NULL DEFAULT 0,
    "cashAdvanceFees" DECIMAL NOT NULL DEFAULT 0,
    "processorFees" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "effectiveApr" DECIMAL,
    "irc163jImpact" DECIMAL,
    "bestCaseFlow" JSONB,
    "baseCaseFlow" JSONB,
    "worstCaseFlow" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cost_calculations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ledger_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "ledger_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256Hash" TEXT,
    "cryptoTimestamp" TEXT,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "documents_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "decline_recoveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "declineReasons" JSONB NOT NULL,
    "adverseActionRaw" TEXT,
    "reconsiderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "reconsiderationNotes" TEXT,
    "reapplyCooldownDate" DATETIME,
    "letterGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "repayment_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "totalBalance" DECIMAL NOT NULL,
    "monthlyPayment" DECIMAL,
    "strategy" TEXT NOT NULL DEFAULT 'avalanche',
    "status" TEXT NOT NULL DEFAULT 'active',
    "interestShockDate" DATETIME,
    "interestShockAmount" DECIMAL,
    "nextPaymentDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repaymentPlanId" TEXT NOT NULL,
    "cardApplicationId" TEXT,
    "issuer" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "minimumPayment" DECIMAL NOT NULL,
    "recommendedPayment" DECIMAL,
    "actualPayment" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "autopayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopayVerified" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_schedules_repaymentPlanId_fkey" FOREIGN KEY ("repaymentPlanId") REFERENCES "repayment_plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spend_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardApplicationId" TEXT,
    "amount" DECIMAL NOT NULL,
    "merchantName" TEXT,
    "mcc" TEXT,
    "mccCategory" TEXT,
    "riskScore" INTEGER,
    "isCashLike" BOOLEAN NOT NULL DEFAULT false,
    "businessPurpose" TEXT,
    "evidenceDocId" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "transactionDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "rewards_optimizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardApplicationId" TEXT NOT NULL,
    "mccCategory" TEXT NOT NULL,
    "rewardsRate" DECIMAL NOT NULL,
    "annualValue" DECIMAL,
    "isOptimalCard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "card_benefits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardApplicationId" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL,
    "benefitName" TEXT NOT NULL,
    "benefitValue" DECIMAL,
    "expiryDate" DATETIME,
    "utilized" BOOLEAN NOT NULL DEFAULT false,
    "utilizedDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "feeBreakdown" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issuedAt" DATETIME,
    "dueDate" DATETIME,
    "paidAt" DATETIME,
    "stripePaymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "commission_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "partnerId" TEXT,
    "advisorId" TEXT,
    "amount" DECIMAL NOT NULL,
    "percentage" DECIMAL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "statement_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardApplicationId" TEXT,
    "issuer" TEXT NOT NULL,
    "statementDate" DATETIME NOT NULL,
    "closingBalance" DECIMAL,
    "minimumPayment" DECIMAL,
    "dueDate" DATETIME,
    "interestCharged" DECIMAL,
    "feesCharged" DECIMAL,
    "sourceDocumentId" TEXT,
    "normalizedData" JSONB,
    "anomalies" JSONB,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "deal_committee_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "riskTier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "redFlagChecklist" JSONB,
    "committeeNotes" TEXT,
    "conditions" JSONB,
    "counselSignoff" BOOLEAN NOT NULL DEFAULT false,
    "accountantSignoff" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" JSONB,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hardship_cases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "paymentPlan" JSONB,
    "settlementOffer" JSONB,
    "counselorReferral" TEXT,
    "cardClosureSequence" JSONB,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "evidenceDocIds" JSONB,
    "callRecordIds" JSONB,
    "rootCause" TEXT,
    "resolution" TEXT,
    "assignedTo" TEXT,
    "escalatedTo" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "complianceScore" INTEGER,
    "dueDiligenceStatus" TEXT NOT NULL DEFAULT 'pending',
    "contractId" TEXT,
    "onboardedAt" DATETIME,
    "nextReviewDate" DATETIME,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "contract_analyses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT,
    "documentId" TEXT,
    "contractType" TEXT NOT NULL,
    "extractedClauses" JSONB,
    "redFlags" JSONB,
    "missingProtections" JSONB,
    "riskScore" INTEGER,
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "comm_compliance_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT,
    "violations" JSONB,
    "riskScore" INTEGER,
    "approved" BOOLEAN,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "approved_scripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "training_certifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "score" INTEGER,
    "completedAt" DATETIME,
    "expiresAt" DATETIME,
    "certificateRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "disclosure_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "workflow_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerEvent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "stopOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "referral_attributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "partnerId" TEXT,
    "channel" TEXT,
    "feeAmount" DECIMAL,
    "feeStatus" TEXT NOT NULL DEFAULT 'pending',
    "consentDocId" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_attributions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "regulatory_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "impactScore" INTEGER,
    "affectedModules" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "effectiveDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" DATETIME,
    "advisorId" TEXT,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "advisor_qa_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "callRecordId" TEXT,
    "overallScore" INTEGER NOT NULL,
    "complianceScore" INTEGER,
    "scriptAdherence" INTEGER,
    "consentCapture" INTEGER,
    "riskClaimAvoidance" INTEGER,
    "feedback" TEXT,
    "scoredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tenant_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "moduleEntitlements" JSONB NOT NULL,
    "usageLimits" JSONB,
    "monthlyPrice" DECIMAL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "usage_meters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" INTEGER NOT NULL DEFAULT 0,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "issuer_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "contactName" TEXT,
    "contactRole" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "reconsiderationLine" TEXT,
    "notes" TEXT,
    "relationshipScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "fair_lending_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "applicationId" TEXT,
    "demographicData" JSONB,
    "businessType" TEXT,
    "creditPurpose" TEXT,
    "actionTaken" TEXT,
    "actionDate" DATETIME,
    "adverseReasons" JSONB,
    "isFirewalled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "funds_flow_classifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "riskBasis" TEXT,
    "regulatoryFramework" TEXT,
    "legalOpinionRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "offboarding_workflows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "offboardingType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "finalInvoiceId" TEXT,
    "refundAmount" DECIMAL,
    "dataExportCompleted" BOOLEAN NOT NULL DEFAULT false,
    "dataDeletionStatus" TEXT NOT NULL DEFAULT 'pending',
    "deletionProofHash" TEXT,
    "retentionSchedule" JSONB,
    "exitReason" TEXT,
    "exitInterviewNotes" TEXT,
    "initiatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ai_decision_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "moduleSource" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "inputHash" TEXT,
    "output" JSONB NOT NULL,
    "confidence" DECIMAL,
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sandbox_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "profileName" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "profileData" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "backupType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "sizeBytes" INTEGER,
    "storageLocation" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_timestamp_idx" ON "audit_logs"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "businesses_tenantId_status_idx" ON "businesses"("tenantId", "status");

-- CreateIndex
CREATE INDEX "credit_profiles_businessId_bureau_pulledAt_idx" ON "credit_profiles"("businessId", "bureau", "pulledAt");

-- CreateIndex
CREATE UNIQUE INDEX "funding_rounds_businessId_roundNumber_key" ON "funding_rounds"("businessId", "roundNumber");

-- CreateIndex
CREATE INDEX "card_applications_businessId_status_idx" ON "card_applications"("businessId", "status");

-- CreateIndex
CREATE INDEX "consent_records_tenantId_businessId_channel_idx" ON "consent_records"("tenantId", "businessId", "channel");

-- CreateIndex
CREATE INDEX "consent_records_status_idx" ON "consent_records"("status");

-- CreateIndex
CREATE INDEX "compliance_checks_tenantId_checkType_idx" ON "compliance_checks"("tenantId", "checkType");

-- CreateIndex
CREATE INDEX "ledger_events_tenantId_eventType_idx" ON "ledger_events"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "ledger_events_aggregateType_aggregateId_idx" ON "ledger_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "ledger_events_publishedAt_idx" ON "ledger_events"("publishedAt");

-- CreateIndex
CREATE INDEX "documents_tenantId_documentType_idx" ON "documents"("tenantId", "documentType");

-- CreateIndex
CREATE INDEX "documents_businessId_idx" ON "documents"("businessId");

-- CreateIndex
CREATE INDEX "decline_recoveries_tenantId_businessId_idx" ON "decline_recoveries"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "repayment_plans_tenantId_businessId_idx" ON "repayment_plans"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "payment_schedules_repaymentPlanId_dueDate_idx" ON "payment_schedules"("repaymentPlanId", "dueDate");

-- CreateIndex
CREATE INDEX "spend_transactions_tenantId_businessId_idx" ON "spend_transactions"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "spend_transactions_mcc_idx" ON "spend_transactions"("mcc");

-- CreateIndex
CREATE INDEX "rewards_optimizations_tenantId_businessId_idx" ON "rewards_optimizations"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_businessId_idx" ON "invoices"("tenantId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "commission_records_tenantId_idx" ON "commission_records"("tenantId");

-- CreateIndex
CREATE INDEX "statement_records_tenantId_businessId_idx" ON "statement_records"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "deal_committee_reviews_tenantId_status_idx" ON "deal_committee_reviews"("tenantId", "status");

-- CreateIndex
CREATE INDEX "hardship_cases_tenantId_status_idx" ON "hardship_cases"("tenantId", "status");

-- CreateIndex
CREATE INDEX "complaints_tenantId_status_idx" ON "complaints"("tenantId", "status");

-- CreateIndex
CREATE INDEX "complaints_category_idx" ON "complaints"("category");

-- CreateIndex
CREATE INDEX "partners_tenantId_type_idx" ON "partners"("tenantId", "type");

-- CreateIndex
CREATE INDEX "contract_analyses_tenantId_idx" ON "contract_analyses"("tenantId");

-- CreateIndex
CREATE INDEX "comm_compliance_records_tenantId_advisorId_idx" ON "comm_compliance_records"("tenantId", "advisorId");

-- CreateIndex
CREATE INDEX "approved_scripts_tenantId_category_idx" ON "approved_scripts"("tenantId", "category");

-- CreateIndex
CREATE INDEX "training_certifications_tenantId_userId_idx" ON "training_certifications"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "disclosure_templates_tenantId_state_category_idx" ON "disclosure_templates"("tenantId", "state", "category");

-- CreateIndex
CREATE INDEX "workflow_rules_tenantId_isActive_idx" ON "workflow_rules"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "policy_rules_tenantId_ruleType_idx" ON "policy_rules"("tenantId", "ruleType");

-- CreateIndex
CREATE INDEX "referral_attributions_tenantId_businessId_idx" ON "referral_attributions"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "regulatory_alerts_tenantId_status_idx" ON "regulatory_alerts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "pipeline_stages_tenantId_stage_idx" ON "pipeline_stages"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "advisor_qa_scores_tenantId_advisorId_idx" ON "advisor_qa_scores"("tenantId", "advisorId");

-- CreateIndex
CREATE INDEX "tenant_plans_tenantId_idx" ON "tenant_plans"("tenantId");

-- CreateIndex
CREATE INDEX "usage_meters_tenantId_metricName_periodStart_idx" ON "usage_meters"("tenantId", "metricName", "periodStart");

-- CreateIndex
CREATE INDEX "issuer_contacts_tenantId_issuer_idx" ON "issuer_contacts"("tenantId", "issuer");

-- CreateIndex
CREATE INDEX "fair_lending_records_tenantId_idx" ON "fair_lending_records"("tenantId");

-- CreateIndex
CREATE INDEX "funds_flow_classifications_tenantId_classification_idx" ON "funds_flow_classifications"("tenantId", "classification");

-- CreateIndex
CREATE INDEX "offboarding_workflows_tenantId_status_idx" ON "offboarding_workflows"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ai_decision_logs_tenantId_moduleSource_idx" ON "ai_decision_logs"("tenantId", "moduleSource");

-- CreateIndex
CREATE INDEX "sandbox_profiles_tenantId_idx" ON "sandbox_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "backup_records_backupType_createdAt_idx" ON "backup_records"("backupType", "createdAt");
