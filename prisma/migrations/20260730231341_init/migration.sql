-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandConfig" JSONB,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_brandings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "customDomain" TEXT,
    "emailFromName" TEXT,
    "emailFromAddr" TEXT,
    "hideCfBranding" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_brandings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'advisor',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_products" (
    "id" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "annualFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "annualFeeWaivedY1" BOOLEAN NOT NULL DEFAULT false,
    "aprIntro" DECIMAL(65,30),
    "aprIntroMonths" INTEGER,
    "aprPostPromo" DECIMAL(65,30),
    "creditLimitMin" INTEGER NOT NULL DEFAULT 0,
    "creditLimitMax" INTEGER NOT NULL DEFAULT 0,
    "creditLimitTypical" INTEGER NOT NULL DEFAULT 0,
    "scoreMinimum" INTEGER NOT NULL DEFAULT 0,
    "revenueMinimum" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "businessAgeMinimum" INTEGER NOT NULL DEFAULT 0,
    "rewardsType" TEXT,
    "rewardsRate" DECIMAL(65,30),
    "rewardsDetails" TEXT,
    "welcomeBonus" TEXT,
    "welcomeBonusValue" DECIMAL(65,30),
    "personalGuarantee" BOOLEAN NOT NULL DEFAULT true,
    "approvalDifficulty" TEXT NOT NULL DEFAULT 'moderate',
    "bestFor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "advisorId" TEXT,
    "legalName" TEXT NOT NULL,
    "dba" TEXT,
    "ein" TEXT,
    "entityType" TEXT NOT NULL,
    "stateOfFormation" TEXT,
    "dateOfFormation" TIMESTAMP(3),
    "mcc" TEXT,
    "industry" TEXT,
    "annualRevenue" DECIMAL(65,30),
    "monthlyRevenue" DECIMAL(65,30),
    "phoneNumber" TEXT,
    "fundingReadinessScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'intake',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_owners" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "ownershipPercent" DECIMAL(65,30) NOT NULL,
    "ssn" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address" JSONB,
    "isBeneficialOwner" BOOLEAN NOT NULL DEFAULT true,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "kycVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_profiles" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "profileType" TEXT NOT NULL,
    "bureau" TEXT NOT NULL,
    "score" INTEGER,
    "scoreType" TEXT,
    "utilization" DECIMAL(65,30),
    "inquiryCount" INTEGER,
    "derogatoryCount" INTEGER,
    "tradelines" JSONB,
    "rawData" JSONB,
    "pulledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_rounds" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "targetCredit" DECIMAL(65,30),
    "targetCardCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "aprExpiryDate" TIMESTAMP(3),
    "alertSent60" BOOLEAN NOT NULL DEFAULT false,
    "alertSent30" BOOLEAN NOT NULL DEFAULT false,
    "alertSent15" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_applications" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fundingRoundId" TEXT,
    "issuer" TEXT NOT NULL,
    "cardProduct" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "creditLimit" DECIMAL(65,30),
    "introApr" DECIMAL(65,30),
    "introAprExpiry" TIMESTAMP(3),
    "regularApr" DECIMAL(65,30),
    "annualFee" DECIMAL(65,30),
    "cashAdvanceFee" DECIMAL(65,30),
    "consentCapturedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "adverseActionNotice" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suitability_checks" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxSafeLeverage" DECIMAL(65,30),
    "recommendation" TEXT NOT NULL,
    "noGoTriggered" BOOLEAN NOT NULL DEFAULT false,
    "noGoReasons" JSONB,
    "alternativeProducts" JSONB,
    "decisionExplanation" TEXT,
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suitability_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "channel" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "ipAddress" TEXT,
    "evidenceRef" TEXT,
    "metadata" JSONB,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_acknowledgments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "acknowledgmentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signatureRef" TEXT,
    "documentVaultId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_acknowledgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "checkType" TEXT NOT NULL,
    "riskScore" INTEGER,
    "riskLevel" TEXT,
    "findings" JSONB,
    "stateJurisdiction" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ach_authorizations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "processorName" TEXT NOT NULL,
    "authorizedAmount" DECIMAL(65,30),
    "authorizedFrequency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "signedDocumentRef" TEXT,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revocationNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ach_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_events" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT,
    "isWithinTolerance" BOOLEAN NOT NULL DEFAULT true,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_calculations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "programFees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percentOfFunding" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "annualFees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashAdvanceFees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "processorFees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "effectiveApr" DECIMAL(65,30),
    "irc163jImpact" DECIMAL(65,30),
    "bestCaseFlow" JSONB,
    "baseCaseFlow" JSONB,
    "worstCaseFlow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ledger_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decline_recoveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "declineReasons" JSONB NOT NULL,
    "adverseActionRaw" TEXT,
    "reconsiderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "reconsiderationNotes" TEXT,
    "reapplyCooldownDate" TIMESTAMP(3),
    "letterGenerated" BOOLEAN NOT NULL DEFAULT false,
    "recoveryStage" TEXT NOT NULL DEFAULT 'new',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decline_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repayment_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "totalBalance" DECIMAL(65,30) NOT NULL,
    "monthlyPayment" DECIMAL(65,30),
    "strategy" TEXT NOT NULL DEFAULT 'avalanche',
    "status" TEXT NOT NULL DEFAULT 'active',
    "interestShockDate" TIMESTAMP(3),
    "interestShockAmount" DECIMAL(65,30),
    "nextPaymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repayment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL,
    "repaymentPlanId" TEXT NOT NULL,
    "cardApplicationId" TEXT,
    "issuer" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "minimumPayment" DECIMAL(65,30) NOT NULL,
    "recommendedPayment" DECIMAL(65,30),
    "actualPayment" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "autopayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopayVerified" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardApplicationId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "merchantName" TEXT,
    "mcc" TEXT,
    "mccCategory" TEXT,
    "riskScore" INTEGER,
    "isCashLike" BOOLEAN NOT NULL DEFAULT false,
    "businessPurpose" TEXT,
    "evidenceDocId" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_optimizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardApplicationId" TEXT NOT NULL,
    "mccCategory" TEXT NOT NULL,
    "rewardsRate" DECIMAL(65,30) NOT NULL,
    "annualValue" DECIMAL(65,30),
    "isOptimalCard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_benefits" (
    "id" TEXT NOT NULL,
    "cardApplicationId" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL,
    "benefitName" TEXT NOT NULL,
    "benefitValue" DECIMAL(65,30),
    "expiryDate" TIMESTAMP(3),
    "utilized" BOOLEAN NOT NULL DEFAULT false,
    "utilizedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "feeBreakdown" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issuedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "partnerId" TEXT,
    "advisorId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "percentage" DECIMAL(65,30),
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardApplicationId" TEXT,
    "issuer" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "closingBalance" DECIMAL(65,30),
    "minimumPayment" DECIMAL(65,30),
    "dueDate" TIMESTAMP(3),
    "interestCharged" DECIMAL(65,30),
    "feesCharged" DECIMAL(65,30),
    "sourceDocumentId" TEXT,
    "normalizedData" JSONB,
    "anomalies" JSONB,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_committee_reviews" (
    "id" TEXT NOT NULL,
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
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_committee_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hardship_cases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "paymentPlan" JSONB,
    "settlementOffer" JSONB,
    "counselorReferral" TEXT,
    "cardClosureSequence" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hardship_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
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
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "complianceScore" INTEGER,
    "dueDiligenceStatus" TEXT NOT NULL DEFAULT 'pending',
    "contractId" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_analyses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT,
    "documentId" TEXT,
    "contractType" TEXT NOT NULL,
    "extractedClauses" JSONB,
    "redFlags" JSONB,
    "missingProtections" JSONB,
    "riskScore" INTEGER,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comm_compliance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT,
    "violations" JSONB,
    "riskScore" INTEGER,
    "approved" BOOLEAN,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comm_compliance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_scripts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approved_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_certifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "score" INTEGER,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "certificateRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disclosure_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disclosure_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerEvent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "stopOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_attributions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "partnerId" TEXT,
    "channel" TEXT,
    "feeAmount" DECIMAL(65,30),
    "feeStatus" TEXT NOT NULL DEFAULT 'pending',
    "consentDocId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_alerts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "impactScore" INTEGER,
    "affectedModules" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "advisorId" TEXT,
    "notes" TEXT,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_qa_scores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "callRecordId" TEXT,
    "overallScore" INTEGER NOT NULL,
    "complianceScore" INTEGER,
    "scriptAdherence" INTEGER,
    "consentCapture" INTEGER,
    "riskClaimAvoidance" INTEGER,
    "feedback" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisor_qa_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "moduleEntitlements" JSONB NOT NULL,
    "usageLimits" JSONB,
    "monthlyPrice" DECIMAL(65,30),
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_meters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuer_contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "contactName" TEXT,
    "contactRole" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "reconsiderationLine" TEXT,
    "notes" TEXT,
    "relationshipScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fair_lending_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "applicationId" TEXT,
    "demographicData" JSONB,
    "businessType" TEXT,
    "creditPurpose" TEXT,
    "actionTaken" TEXT,
    "actionDate" TIMESTAMP(3),
    "adverseReasons" JSONB,
    "isFirewalled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fair_lending_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds_flow_classifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "riskBasis" TEXT,
    "regulatoryFramework" TEXT,
    "legalOpinionRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_flow_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offboarding_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "offboardingType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "finalInvoiceId" TEXT,
    "refundAmount" DECIMAL(65,30),
    "dataExportCompleted" BOOLEAN NOT NULL DEFAULT false,
    "dataDeletionStatus" TEXT NOT NULL DEFAULT 'pending',
    "deletionProofHash" TEXT,
    "retentionSchedule" JSONB,
    "exitReason" TEXT,
    "exitInterviewNotes" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offboarding_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_decision_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleSource" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "inputHash" TEXT,
    "output" JSONB NOT NULL,
    "confidence" DECIMAL(65,30),
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileName" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "profileData" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "backupType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "sizeBytes" INTEGER,
    "storageLocation" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logoUrl" TEXT,
    "phoneRecon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuer_rules" (
    "id" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value" DOUBLE PRECISION,
    "periodDays" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'hard',
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "lastVerified" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuer_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_unions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "charterNumber" TEXT,
    "membershipCriteria" TEXT,
    "openMembership" BOOLEAN NOT NULL DEFAULT false,
    "joinFee" DOUBLE PRECISION,
    "assetMillions" DOUBLE PRECISION,
    "businessCardsOffered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_unions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_union_products" (
    "id" TEXT NOT NULL,
    "creditUnionId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "maxLimit" DOUBLE PRECISION,
    "aprIntro" DOUBLE PRECISION,
    "aprIntroMonths" INTEGER,
    "aprPostPromo" DOUBLE PRECISION,
    "annualFee" DOUBLE PRECISION,
    "scoreMinimum" INTEGER,
    "businessAgeMinimum" INTEGER,
    "revenueMinimum" DOUBLE PRECISION,
    "rewardsType" TEXT,
    "rewardsRate" DOUBLE PRECISION,
    "personalGuarantee" BOOLEAN NOT NULL DEFAULT true,
    "hardPull" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_union_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "advisorId" TEXT,
    "twilioCallSid" TEXT,
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "toPhoneNumber" TEXT NOT NULL,
    "fromPhoneNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "purpose" TEXT NOT NULL,
    "campaignType" TEXT,
    "campaignId" TEXT,
    "durationSeconds" INTEGER,
    "transcriptText" TEXT,
    "documentVaultId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_compliance_scans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "criticalViolationCount" INTEGER NOT NULL DEFAULT 0,
    "complianceStatus" TEXT NOT NULL,
    "violationsJson" TEXT NOT NULL,
    "disclosuresJson" TEXT NOT NULL,
    "isLiveScan" BOOLEAN NOT NULL DEFAULT false,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_compliance_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_qa_scores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "complianceScore" INTEGER,
    "scriptAdherence" INTEGER,
    "tcpaHandling" INTEGER,
    "consentCapture" INTEGER,
    "riskClaimAvoidance" INTEGER,
    "disclosureDelivery" INTEGER,
    "grade" TEXT NOT NULL,
    "feedback" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_qa_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brandings_tenantId_key" ON "tenant_brandings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_timestamp_idx" ON "audit_logs"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "card_products_issuerId_idx" ON "card_products"("issuerId");

-- CreateIndex
CREATE INDEX "card_products_cardType_idx" ON "card_products"("cardType");

-- CreateIndex
CREATE INDEX "card_products_isActive_idx" ON "card_products"("isActive");

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
CREATE INDEX "ai_generation_logs_tenantId_feature_idx" ON "ai_generation_logs"("tenantId", "feature");

-- CreateIndex
CREATE INDEX "backup_records_backupType_createdAt_idx" ON "backup_records"("backupType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "issuers_name_key" ON "issuers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "issuers_slug_key" ON "issuers"("slug");

-- CreateIndex
CREATE INDEX "issuer_rules_issuerId_ruleType_idx" ON "issuer_rules"("issuerId", "ruleType");

-- CreateIndex
CREATE INDEX "issuer_rules_isActive_idx" ON "issuer_rules"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "credit_unions_slug_key" ON "credit_unions"("slug");

-- CreateIndex
CREATE INDEX "credit_union_products_creditUnionId_productType_idx" ON "credit_union_products"("creditUnionId", "productType");

-- CreateIndex
CREATE INDEX "voice_calls_tenantId_businessId_idx" ON "voice_calls"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "voice_calls_tenantId_status_idx" ON "voice_calls"("tenantId", "status");

-- CreateIndex
CREATE INDEX "voice_calls_twilioCallSid_idx" ON "voice_calls"("twilioCallSid");

-- CreateIndex
CREATE INDEX "call_compliance_scans_tenantId_callId_idx" ON "call_compliance_scans"("tenantId", "callId");

-- CreateIndex
CREATE INDEX "call_compliance_scans_tenantId_complianceStatus_idx" ON "call_compliance_scans"("tenantId", "complianceStatus");

-- CreateIndex
CREATE INDEX "call_qa_scores_tenantId_advisorId_idx" ON "call_qa_scores"("tenantId", "advisorId");

-- CreateIndex
CREATE INDEX "call_qa_scores_tenantId_callId_idx" ON "call_qa_scores"("tenantId", "callId");

-- AddForeignKey
ALTER TABLE "tenant_brandings" ADD CONSTRAINT "tenant_brandings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_owners" ADD CONSTRAINT "business_owners_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_profiles" ADD CONSTRAINT "credit_profiles_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_applications" ADD CONSTRAINT "card_applications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_applications" ADD CONSTRAINT "card_applications_fundingRoundId_fkey" FOREIGN KEY ("fundingRoundId") REFERENCES "funding_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suitability_checks" ADD CONSTRAINT "suitability_checks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_acknowledgments" ADD CONSTRAINT "product_acknowledgments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ach_authorizations" ADD CONSTRAINT "ach_authorizations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_events" ADD CONSTRAINT "debit_events_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "ach_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_calculations" ADD CONSTRAINT "cost_calculations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_plans" ADD CONSTRAINT "repayment_plans_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_repaymentPlanId_fkey" FOREIGN KEY ("repaymentPlanId") REFERENCES "repayment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issuer_rules" ADD CONSTRAINT "issuer_rules_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "issuers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_union_products" ADD CONSTRAINT "credit_union_products_creditUnionId_fkey" FOREIGN KEY ("creditUnionId") REFERENCES "credit_unions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_compliance_scans" ADD CONSTRAINT "call_compliance_scans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_compliance_scans" ADD CONSTRAINT "call_compliance_scans_callId_fkey" FOREIGN KEY ("callId") REFERENCES "voice_calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_qa_scores" ADD CONSTRAINT "call_qa_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_qa_scores" ADD CONSTRAINT "call_qa_scores_callId_fkey" FOREIGN KEY ("callId") REFERENCES "voice_calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
