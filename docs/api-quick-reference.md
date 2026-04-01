# CapitalForge — API Quick Reference

**Base URL:** `http://localhost:4000/api`
**Auth:** `Authorization: Bearer <access_token>` on all authenticated routes
**Tenant:** `X-Tenant-ID: <tenant_uuid>` on all authenticated routes
**Response envelope:** `{ success: true, data: {...} }` / `{ success: false, error: { code, message } }`

Full interactive docs: `http://localhost:4000/api/docs` (OpenAPI)
Full annotated reference: [`docs/api.md`](api.md)

---

## Platform

### Health

```
GET    /api/health                                              — System health check (public)
```

### Authentication

```
POST   /api/auth/register                                       — Register new user (public)
POST   /api/auth/login                                          — Login, receive token pair (public)
POST   /api/auth/refresh                                        — Rotate refresh token, new pair (public)
POST   /api/auth/logout                                         — Invalidate refresh token
```

### Businesses & Onboarding

```
POST   /api/businesses                                          — Create business, begin onboarding
GET    /api/businesses                                          — List businesses (paginated)
GET    /api/businesses/:id                                      — Get single business
PATCH  /api/businesses/:id                                      — Update business fields
POST   /api/businesses/:id/owners                               — Add beneficial owner
GET    /api/businesses/:id/owners                               — List beneficial owners
PATCH  /api/businesses/:id/owners/:ownerId                      — Update beneficial owner
POST   /api/businesses/:id/kyb-verify                           — Trigger KYB verification
POST   /api/businesses/:id/kyc-verify                           — Trigger KYC verification for owner
```

### Document Vault

```
POST   /api/documents                                           — Upload document (multipart/form-data)
GET    /api/documents/:id                                       — Get document metadata + download URL
DELETE /api/documents/:id                                       — Soft-delete document (blocked if legal hold)
GET    /api/businesses/:id/documents                            — List documents for a business
PATCH  /api/documents/:id/legal-hold                            — Set or release legal hold
```

### Audit Ledger

```
GET    /api/audit/events                                        — Query ledger (paginated; filter by type/aggregate/date)
GET    /api/audit/events/:aggregateType/:aggregateId            — Full event history for one entity
```

### Admin

```
GET    /api/admin/tenants                                       — List all tenants (super_admin)
POST   /api/admin/tenants                                       — Create tenant (super_admin)
GET    /api/admin/tenants/:tenantId                             — Get tenant details
PATCH  /api/admin/tenants/:tenantId                             — Update tenant settings
GET    /api/admin/tenants/:tenantId/users                       — List users for tenant
POST   /api/admin/tenants/:tenantId/users                       — Create user in tenant
PATCH  /api/admin/users/:userId                                 — Update user (role, active status)
DELETE /api/admin/users/:userId                                 — Deactivate user
GET    /api/admin/reports/overview                              — Tenant summary report
GET    /api/admin/reports/funding-summary                       — Funding totals by tenant
```

### API Portal

```
GET    /api/portal/api-keys                                     — List API keys for tenant
POST   /api/portal/api-keys                                     — Create API key
DELETE /api/portal/api-keys/:keyId                              — Revoke API key
GET    /api/portal/webhooks                                     — List webhook endpoints
POST   /api/portal/webhooks                                     — Register webhook endpoint
PATCH  /api/portal/webhooks/:hookId                             — Update webhook endpoint
DELETE /api/portal/webhooks/:hookId                             — Delete webhook endpoint
GET    /api/portal/usage                                        — API usage analytics
GET    /api/portal/rate-limits                                  — Current rate limit status
```

### CRM

```
GET    /api/crm/contacts                                        — List CRM contacts
POST   /api/crm/contacts                                        — Create CRM contact
GET    /api/crm/contacts/:contactId                             — Get contact
PATCH  /api/crm/contacts/:contactId                             — Update contact
GET    /api/crm/pipeline                                        — List pipeline stages and deals
POST   /api/crm/pipeline                                        — Create pipeline entry
PATCH  /api/crm/pipeline/:entryId                               — Update pipeline stage
GET    /api/crm/activities                                      — List activity log
POST   /api/crm/activities                                      — Log activity
```

### Referral Engine

```
GET    /api/referrals                                           — List referral records
POST   /api/referrals                                           — Create referral
GET    /api/referrals/:referralId                               — Get referral details
PATCH  /api/referrals/:referralId                               — Update referral status
GET    /api/referrals/payouts                                   — List pending referral payouts
POST   /api/referrals/payouts/:referralId/mark-paid             — Mark referral fee paid
```

### Partner Governance

```
GET    /api/partners                                            — List partners
POST   /api/partners                                            — Onboard partner
GET    /api/partners/:partnerId                                 — Get partner details
PATCH  /api/partners/:partnerId                                 — Update partner record
GET    /api/partners/:partnerId/agreements                      — List partner agreements
POST   /api/partners/:partnerId/agreements                      — Upload partner agreement
GET    /api/partners/:partnerId/performance                     — Partner performance metrics
```

### SaaS Entitlements

```
GET    /api/entitlements                                        — Get feature flags for tenant
POST   /api/entitlements/check                                  — Check if feature is enabled
PATCH  /api/entitlements/:feature                               — Enable/disable feature for tenant
GET    /api/entitlements/usage                                  — Current usage metering data
```

### Sandbox

```
POST   /api/sandbox/reset                                       — Reset sandbox to clean state
POST   /api/sandbox/seed                                        — Seed synthetic data
GET    /api/sandbox/status                                      — Get sandbox status
```

### Data Lineage

```
GET    /api/lineage/:entityType/:entityId                       — Get field-level lineage for entity
GET    /api/lineage/sources                                     — List registered data sources
```

### Business Continuity

```
GET    /api/continuity/runbooks                                 — List DR runbooks
GET    /api/continuity/runbooks/:runbookId                      — Get runbook details
GET    /api/continuity/rpo-rto                                  — Current RTO/RPO SLA status
```

### Client Graduation

```
POST   /api/businesses/:id/graduate                             — Initiate client graduation
GET    /api/businesses/:id/graduation-report                    — Get graduation summary report
PATCH  /api/businesses/:id/graduation/:graduationId             — Update graduation status
```

---

## Intelligence

### Credit Intelligence

```
POST   /api/businesses/:id/credit-profiles                      — Ingest credit profile
GET    /api/businesses/:id/credit-profiles                      — List credit profiles
GET    /api/businesses/:id/credit-profiles/latest               — Latest profile per bureau
GET    /api/businesses/:id/credit-profiles/:profileId           — Get specific profile
```

### Funding Readiness

```
POST   /api/businesses/:id/readiness-score                      — Compute readiness score
GET    /api/businesses/:id/readiness-score/latest               — Get latest readiness score
GET    /api/businesses/:id/readiness-score/history              — Score history
```

### Leverage Calculator

```
POST   /api/businesses/:id/cost-calculations                    — Compute cost of capital
GET    /api/businesses/:id/cost-calculations                    — List cost calculations
GET    /api/businesses/:id/cost-calculations/:calcId            — Get specific calculation
```

### Fraud Detection

```
POST   /api/businesses/:id/fraud-check                          — Run fraud detection
GET    /api/businesses/:id/fraud-checks                         — List fraud check results
GET    /api/fraud-signals                                       — Cross-tenant signal aggregates (super_admin)
```

### Sanctions Screening

```
POST   /api/businesses/:id/sanctions-screen                     — Screen business + owners against OFAC/PEP
GET    /api/businesses/:id/sanctions-results                    — List screening results
GET    /api/businesses/:id/sanctions-results/latest             — Latest screening result
```

### AI Governance

```
GET    /api/governance/model-cards                              — List registered model cards
POST   /api/governance/model-cards                              — Register model card
GET    /api/governance/model-cards/:modelId                     — Get model card
GET    /api/governance/fairness-reports                         — List fairness monitoring reports
GET    /api/governance/audit-trail                              — AI decision audit trail
```

### Decision Explainability

```
GET    /api/businesses/:id/decision-explanations                — List decision rationale records
GET    /api/businesses/:id/decision-explanations/:decisionId    — Get human-readable rationale
```

### Funding Simulator

```
POST   /api/businesses/:id/simulations                          — Run Monte Carlo funding simulation
GET    /api/businesses/:id/simulations                          — List simulation results
GET    /api/businesses/:id/simulations/:simId                   — Get simulation details
```

### Stress Test Engine

```
POST   /api/businesses/:id/stress-tests                         — Run portfolio stress test
GET    /api/businesses/:id/stress-tests                         — List stress test results
GET    /api/businesses/:id/stress-tests/:testId                 — Get stress test details
```

### Credit Optimizer

```
GET    /api/businesses/:id/credit-optimization                  — Get optimization roadmap
POST   /api/businesses/:id/credit-optimization/refresh          — Recompute optimization plan
```

### Credit Builder

```
GET    /api/businesses/:id/credit-builder                       — Get credit builder program status
POST   /api/businesses/:id/credit-builder/enroll                — Enroll in credit builder track
PATCH  /api/businesses/:id/credit-builder/milestone/:milestoneId — Update milestone completion
```

---

## Orchestration

### Funding Rounds

```
POST   /api/businesses/:id/funding-rounds                       — Create funding round
GET    /api/businesses/:id/funding-rounds                       — List funding rounds
GET    /api/businesses/:id/funding-rounds/:roundId              — Get round with application summary
PATCH  /api/businesses/:id/funding-rounds/:roundId              — Update round (status, targets, APR date)
DELETE /api/businesses/:id/funding-rounds/:roundId              — Archive funding round
```

### Card Applications

```
POST   /api/businesses/:id/applications                         — Create card application (draft)
GET    /api/businesses/:id/applications                         — List applications
GET    /api/businesses/:id/applications/:appId                  — Get application
PATCH  /api/businesses/:id/applications/:appId                  — Update application (status, decision)
DELETE /api/businesses/:id/applications/:appId                  — Cancel application
GET    /api/businesses/:id/applications/:appId/adverse-action   — Get adverse action notice
POST   /api/businesses/:id/applications/:appId/maker-check      — Submit maker-checker approval
```

### APR Alerts

```
GET    /api/businesses/:id/apr-alerts                           — List pending APR expiry alerts
POST   /api/businesses/:id/apr-alerts/schedule                  — Manually schedule alerts for round
DELETE /api/businesses/:id/apr-alerts/:alertId                  — Dismiss alert
```

### Card Benefits

```
GET    /api/card-benefits                                       — List benefits catalogue
GET    /api/card-benefits/:issuer/:product                      — Get benefits for card product
POST   /api/businesses/:id/benefits-analysis                    — Analyze benefits for business spend profile
```

### Rewards Optimization

```
POST   /api/businesses/:id/rewards-optimization                 — Compute cross-card rewards routing
GET    /api/businesses/:id/rewards-optimization/latest          — Latest optimization plan
```

### Auto-Restack Engine

```
GET    /api/businesses/:id/restack-eligibility                  — Check restack eligibility
POST   /api/businesses/:id/restack-triggers                     — Fire manual restack trigger
GET    /api/businesses/:id/restack-triggers                     — List restack trigger history
```

### Decline Recovery

```
POST   /api/businesses/:id/applications/:appId/decline-analysis — Analyze decline and recommend next steps
POST   /api/businesses/:id/applications/:appId/reconsideration  — Submit reconsideration request
GET    /api/businesses/:id/decline-recovery                     — List recovery workflow entries
```

### Issuer Relationship Manager

```
GET    /api/issuers                                             — List issuer profiles
GET    /api/issuers/:issuer/rules                               — Get velocity/eligibility rules for issuer
GET    /api/businesses/:id/issuer-health                        — Issuer relationship health for business
PATCH  /api/businesses/:id/issuer-health/:issuer               — Update issuer relationship notes
```

### Deal Committee

```
POST   /api/deals                                               — Create deal for committee review
GET    /api/deals                                               — List deals
GET    /api/deals/:dealId                                       — Get deal with review history
POST   /api/deals/:dealId/vote                                  — Submit committee vote
POST   /api/deals/:dealId/approve                               — Approve deal (quorum met)
POST   /api/deals/:dealId/reject                                — Reject deal
```

### Workflow Engine

```
GET    /api/workflows                                           — List workflow definitions
POST   /api/workflows                                           — Create workflow definition
GET    /api/workflows/:workflowId/runs                          — List workflow runs
POST   /api/businesses/:id/workflow-runs                        — Start workflow run for business
GET    /api/businesses/:id/workflow-runs/:runId                 — Get workflow run status
PATCH  /api/businesses/:id/workflow-runs/:runId/step            — Advance workflow step
```

### Policy Orchestration

```
GET    /api/policies                                            — List policy rule chains
POST   /api/policies                                            — Create policy
GET    /api/policies/:policyId                                  — Get policy
PATCH  /api/policies/:policyId                                  — Update policy rules
POST   /api/policies/:policyId/evaluate                         — Evaluate policy against context
GET    /api/policies/exceptions                                 — List policy exceptions (pending escalation)
```

### VoiceForge

```
POST   /api/voiceforge/calls                                    — Initiate outbound call (TCPA consent gate)
GET    /api/voiceforge/calls/:callId                            — Get call record
GET    /api/businesses/:id/calls                                — List calls for business
POST   /api/voiceforge/compliance-scan                          — Scan call transcript for violations
GET    /api/voiceforge/calls/:callId/compliance-report          — Get call compliance report
POST   /api/voiceforge/campaigns                                — Create outreach campaign
GET    /api/voiceforge/campaigns                                — List campaigns
PATCH  /api/voiceforge/campaigns/:campaignId                    — Update campaign
POST   /api/voiceforge/campaigns/:campaignId/launch             — Launch campaign
GET    /api/voiceforge/calls/:callId/qa-score                   — Get QA score for call
```

---

## Compliance

### Suitability & No-Go

```
POST   /api/businesses/:id/suitability                          — Run suitability assessment
GET    /api/businesses/:id/suitability/latest                   — Get latest suitability check
GET    /api/businesses/:id/suitability/history                  — Suitability check history
POST   /api/businesses/:id/suitability/:checkId/override        — Override no-go (supervisor, documented reason)
```

### Consent

```
POST   /api/consent                                             — Capture consent record
GET    /api/businesses/:id/consent                              — List consents for business
GET    /api/consent/:consentId                                  — Get consent record
DELETE /api/consent/:consentId                                  — Revoke consent (soft revocation)
GET    /api/consent/:consentId/history                          — Consent state history
```

### Product Acknowledgments

```
GET    /api/acknowledgment-templates                            — List active acknowledgment templates
GET    /api/acknowledgment-templates/:type                      — Get template for type (product_reality, fee_schedule, etc.)
POST   /api/acknowledgment-templates                            — Create acknowledgment template version
POST   /api/businesses/:id/acknowledgments                      — Record signed acknowledgment
GET    /api/businesses/:id/acknowledgments                      — List acknowledgments
GET    /api/businesses/:id/acknowledgments/:ackId               — Get acknowledgment
```

### ACH Debit Control

```
POST   /api/businesses/:id/ach-authorizations                   — Create ACH debit authorization
GET    /api/businesses/:id/ach-authorizations                   — List ACH authorizations
GET    /api/ach-authorizations/:authId                          — Get authorization
DELETE /api/ach-authorizations/:authId                          — Revoke authorization
POST   /api/ach-authorizations/:authId/debit-events             — Record debit event (for monitoring)
GET    /api/ach-authorizations/:authId/debit-events             — List debit events
```

### UDAP/UDAAP

```
POST   /api/compliance/udap-check                               — Run UDAP/UDAAP scan on content
GET    /api/businesses/:id/compliance-checks                    — List compliance checks
GET    /api/compliance-checks/:checkId                          — Get check details
PATCH  /api/compliance-checks/:checkId/resolve                  — Mark finding resolved
```

### State Law Mapper

```
GET    /api/compliance/state-laws                               — List state law profiles
GET    /api/compliance/state-laws/:state                        — Get profile for state (CA, NY, federal, etc.)
POST   /api/compliance/state-law-check                          — Check transaction against state law
```

### Disclosure CMS

```
GET    /api/disclosures                                         — List disclosure templates
POST   /api/disclosures                                         — Create disclosure template
GET    /api/disclosures/:disclosureId                           — Get disclosure
PATCH  /api/disclosures/:disclosureId/approve                   — Approve disclosure for use
GET    /api/disclosures/active/:jurisdiction                    — Get active disclosure for jurisdiction
```

### Fair Lending Monitor

```
GET    /api/compliance/fair-lending/adverse-actions             — List adverse actions with ECOA metadata
POST   /api/compliance/fair-lending/adverse-actions             — Record adverse action
GET    /api/compliance/fair-lending/1071-data                   — Get Section 1071 collection fields
PATCH  /api/businesses/:id/1071-data                            — Update Section 1071 fields for business
GET    /api/compliance/1071-export                              — Export Section 1071 data (CFPB format)
```

### Complaint Management

```
POST   /api/complaints                                          — Intake consumer complaint
GET    /api/complaints                                          — List complaints
GET    /api/complaints/:complaintId                             — Get complaint
PATCH  /api/complaints/:complaintId/triage                      — Triage and assign complaint
PATCH  /api/complaints/:complaintId/close                       — Close complaint with resolution
GET    /api/complaints/:complaintId/response                    — Get regulatory response packet
```

### Regulatory Intelligence

```
GET    /api/regulatory/updates                                  — List regulatory change notices
GET    /api/regulatory/updates/:updateId                        — Get regulatory update details
POST   /api/regulatory/impact-assessment                        — Run impact assessment
GET    /api/regulatory/alerts                                   — Active regulatory alerts
```

### Regulator Response

```
POST   /api/regulatory/exam-responses                           — Create exam response packet
GET    /api/regulatory/exam-responses                           — List exam response packets
GET    /api/regulatory/exam-responses/:responseId               — Get exam response
POST   /api/regulatory/exam-responses/:responseId/documents     — Add document to exam response
GET    /api/regulatory/privilege-log                            — List privilege log entries
```

### Comm Compliance

```
GET    /api/compliance/banned-claims                            — List banned claims registry
POST   /api/compliance/banned-claims                            — Add banned claim
GET    /api/compliance/required-disclosures                     — List required disclosure catalogue
POST   /api/compliance/marketing-review                         — Submit marketing copy for pre-approval
GET    /api/compliance/marketing-review/:submissionId           — Get review status
PATCH  /api/compliance/marketing-review/:submissionId/approve   — Approve marketing copy
```

### Rules Versioning

```
GET    /api/compliance/rule-snapshots                           — List compliance rule snapshots
POST   /api/compliance/rule-snapshots                           — Create rule snapshot
GET    /api/compliance/rule-snapshots/:snapshotId               — Get rule snapshot
POST   /api/compliance/rule-snapshots/:snapshotId/rollback      — Roll back to snapshot
```

---

## Financial

### Spend Governance

```
POST   /api/businesses/:id/spend-policies                       — Create spend policy
GET    /api/businesses/:id/spend-policies                       — List spend policies
PATCH  /api/businesses/:id/spend-policies/:policyId             — Update spend policy
POST   /api/businesses/:id/spend-events                         — Record spend event
GET    /api/businesses/:id/spend-violations                     — List policy violations
PATCH  /api/businesses/:id/spend-violations/:violationId        — Resolve violation
```

### Statement Reconciliation

```
POST   /api/businesses/:id/reconciliations                      — Create reconciliation run
GET    /api/businesses/:id/reconciliations                      — List reconciliation runs
GET    /api/businesses/:id/reconciliations/:reconId             — Get reconciliation with discrepancies
PATCH  /api/businesses/:id/reconciliations/:reconId/discrepancies/:discId — Resolve discrepancy
```

### Repayment

```
POST   /api/businesses/:id/repayment-schedules                  — Create repayment schedule
GET    /api/businesses/:id/repayment-schedules                  — List repayment schedules
GET    /api/businesses/:id/repayment-schedules/:scheduleId      — Get schedule
PATCH  /api/businesses/:id/repayment-schedules/:scheduleId      — Update schedule
POST   /api/businesses/:id/repayment-schedules/:scheduleId/early-payoff — Calculate early payoff incentive
```

### Hardship

```
POST   /api/businesses/:id/hardship-assessments                 — Submit hardship assessment
GET    /api/businesses/:id/hardship-assessments                 — List assessments
GET    /api/businesses/:id/hardship-assessments/:assessmentId   — Get assessment
PATCH  /api/businesses/:id/hardship-assessments/:assessmentId/restructure — Apply restructuring plan
```

### Tax Documents

```
GET    /api/businesses/:id/tax-documents                        — List tax documents
POST   /api/businesses/:id/tax-documents/generate               — Generate tax document bundle
GET    /api/businesses/:id/tax-documents/:docId                 — Get tax document
POST   /api/businesses/:id/tax-documents/:docId/efile-stub      — Mark as e-filed
```

### Funds Flow Classification

```
POST   /api/businesses/:id/transactions/classify                — Classify bank transactions
GET    /api/businesses/:id/transactions                         — List classified transactions
PATCH  /api/businesses/:id/transactions/:txId/category          — Update transaction category
GET    /api/businesses/:id/transactions/gl-codes                — Get GL code suggestions
```

### IRC 163(j) Analysis

```
POST   /api/businesses/:id/163j-analysis                        — Run IRC 163(j) deductibility analysis
GET    /api/businesses/:id/163j-analysis/latest                 — Get latest analysis
GET    /api/businesses/:id/163j-analysis/history                — Analysis history
```

### Statement Normalizer (VisionAudioForge)

```
POST   /api/businesses/:id/statements/upload                    — Upload raw bank statement (PDF/CSV/OFX)
GET    /api/businesses/:id/statements                           — List normalized statements
GET    /api/businesses/:id/statements/:statementId              — Get normalized statement
GET    /api/businesses/:id/statements/:statementId/transactions — Get parsed transactions
```

### Business Purpose Evidence

```
POST   /api/businesses/:id/purpose-evidence                     — Capture business-use affirmation
GET    /api/businesses/:id/purpose-evidence                     — List evidence records
GET    /api/businesses/:id/purpose-evidence/:evidenceId         — Get evidence record
```

### Revenue Ops

```
GET    /api/revenue/program-fees                                — List program fee records
POST   /api/revenue/program-fees                                — Create program fee record
GET    /api/revenue/cohort-analytics                            — Cohort revenue analytics
GET    /api/revenue/advisor-commissions                         — List advisor commissions
POST   /api/revenue/advisor-commissions/:commissionId/pay       — Mark commission paid
```

---

## VisionAudioForge (Document Intelligence)

```
POST   /api/vaf/process                                         — Submit document for OCR processing
GET    /api/vaf/jobs/:jobId                                     — Get processing job status
GET    /api/businesses/:id/vaf-results                          — List VAF processing results for business
GET    /api/vaf/results/:resultId                               — Get structured extraction result
POST   /api/vaf/results/:resultId/maker-entry                   — Submit maker entry (human verification)
POST   /api/vaf/results/:resultId/checker-approve               — Approve maker entry (checker)
POST   /api/vaf/results/:resultId/checker-reject                — Reject maker entry (checker)
POST   /api/businesses/:id/evidence-bundles                     — Assemble evidence bundle from documents
GET    /api/businesses/:id/evidence-bundles                     — List evidence bundles
GET    /api/businesses/:id/evidence-bundles/:bundleId           — Get evidence bundle
```

---

## Error Codes Reference

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Valid token but insufficient permission |
| `TENANT_MISMATCH` | 403 | Token tenant does not match X-Tenant-ID |
| `NOT_FOUND` | 404 | Resource does not exist in this tenant |
| `VALIDATION_ERROR` | 422 | Zod validation failed — see `details` |
| `CONFLICT` | 409 | Duplicate resource or state conflict |
| `NOGO_TRIGGERED` | 422 | Suitability no-go blocks this action |
| `CONSENT_REQUIRED` | 422 | No active consent for required channel/type |
| `ACK_REQUIRED` | 422 | Required acknowledgment not signed |
| `LEGAL_HOLD` | 403 | Document deletion blocked by legal hold |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error — check request ID in logs |
