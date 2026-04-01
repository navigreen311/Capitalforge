# CapitalForge — Incident Response Plan

**Platform:** CapitalForge
**Version:** 1.0
**Effective Date:** 2026-03-31
**Review Cycle:** Annual + after every P1/P2 incident
**Plan Owner:** Chief Information Security Officer (CISO)
**Approved By:** [CEO — signature required before activation]

> **Legal Disclaimer:** This plan addresses technical and operational incident response. For any incident involving potential NPI breach or regulatory notification obligations, qualified legal counsel must be engaged immediately. This document does not constitute legal advice.

---

## Contents

1. [Severity Classification](#1-severity-classification)
2. [Response Team and Escalation Matrix](#2-response-team-and-escalation-matrix)
3. [Incident Response Procedures by Phase](#3-incident-response-procedures-by-phase)
4. [Platform-Specific Containment Actions](#4-platform-specific-containment-actions)
5. [Communication Templates](#5-communication-templates)
6. [Post-Mortem Template](#6-post-mortem-template)
7. [Incident Log](#7-incident-log)

---

## 1. Severity Classification

### P1 — Critical

**Definition:** Immediate risk to customer data or complete platform unavailability.

**Criteria (any one triggers P1):**
- Confirmed or strongly suspected unauthorized access to NPI (SSN, DOB, EIN, credit data, bank account data)
- Complete platform outage affecting all tenants
- Active exploitation of a vulnerability in production
- Encryption key compromise
- Ransomware or destructive malware on production systems
- Complete loss of the Document Vault or canonical audit ledger

**Response SLA:**
- Initial response: within **1 hour** of detection
- Containment: within **4 hours**
- Regulatory notification assessment: within **4 hours** (legal counsel engaged immediately)
- Customer notification: within **72 hours** (if breach confirmed)

### P2 — High

**Definition:** Significant risk or partial system impact requiring urgent attention.

**Criteria (any one triggers P2):**
- Suspicious access patterns that may indicate data exfiltration (under investigation)
- Partial data exposure limited to non-NPI data
- Significant degradation affecting a subset of tenants (> 30 minute impact)
- Failed or corrupt database backup
- Unauthorized admin-level access (even if no data exfiltration confirmed)
- Vendor security incident potentially affecting CapitalForge data

**Response SLA:**
- Initial response: within **4 hours**
- Containment: within **24 hours**
- Legal counsel notification: if data exposure confirmed

### P3 — Medium

**Definition:** Moderate risk or limited service impact.

**Criteria:**
- Suspicious activity requiring investigation but no confirmed breach
- Single-tenant availability incident (< 2 hours)
- Compliance rule violation without data exposure
- Vulnerability discovered in a non-production system
- Repeated failed login attempts indicating credential stuffing attempt
- Third-party service degradation affecting non-critical platform functions

**Response SLA:**
- Initial response: within **8 hours**
- Resolution: within **72 hours**

### P4 — Low

**Definition:** Low risk, informational, or policy violations.

**Criteria:**
- Single user-reported access issue with no security implication
- Non-critical vulnerability in internal tooling
- Policy violation with no data impact
- Outdated dependency with no known active exploit
- Minor anomaly detected in audit logs (no confirmed malicious activity)

**Response SLA:**
- Initial response: within **24 hours**
- Resolution: within **7 days** (or tracked in engineering backlog for vulnerabilities)

---

## 2. Response Team and Escalation Matrix

### Core Incident Response Team

| Role | Responsibility | P1 Required? | P2 Required? | Contact |
|------|---------------|-------------|-------------|---------|
| **Incident Commander** | Coordinates response; makes containment decisions; authorizes external communications | Yes | Yes | [NAME — CISO or designee] |
| **Security Engineer** | Technical investigation; log analysis; containment execution | Yes | Yes | [NAME] |
| **DevOps / SRE** | Infrastructure access; service restart; database operations | Yes | Yes | [NAME] |
| **Engineering Lead** | Code-level investigation; hotfix deployment | Yes | Recommended | [NAME] |
| **Compliance Officer** | Regulatory notification assessment; audit ledger review | Yes | Yes | [NAME] |
| **Legal Counsel** | Notification obligations; regulatory filings | Yes (breach) | If data exposure | [FIRM / NAME] |
| **CEO / Executive** | Stakeholder communication; board notification | P1 only | If requested | [NAME] |
| **Customer Success** | Tenant communication | P1 (breach) | As needed | [NAME] |

### Escalation Decision Tree

```
Incident Detected
      │
      ▼
Is data (NPI, financial, or system) confirmed compromised?
      │
      ├── YES → P1 immediately → Engage Incident Commander + Legal Counsel
      │
      └── NO → Assess impact scope
                    │
                    ├── Full outage → P1
                    ├── Partial outage / high risk → P2
                    ├── Limited impact / under investigation → P3
                    └── Low risk / policy violation → P4
```

### On-Call Escalation Chain

1. On-call Security Engineer (primary)
2. Engineering Lead (if Security Engineer unavailable within 15 minutes)
3. CISO (if Engineering Lead unavailable within 15 minutes, or any P1 incident)
4. CEO (P1 incidents always; P2 at CISO discretion)

---

## 3. Incident Response Procedures by Phase

### Phase 1 — Detection and Triage

**Trigger sources:**
- `risk.alert.raised` event in canonical ledger
- Fraud Detection module alert
- External security researcher disclosure
- Monitoring / alerting system alert
- Customer or tenant report
- Third-party (vendor) notification
- Internal employee report

**Triage Steps:**
1. Acknowledge the alert/report in the incident tracking system.
2. Assign a unique Incident ID: `INC-YYYY-MM-DD-NNN` (e.g., `INC-2026-03-31-001`).
3. Conduct initial assessment to determine severity (P1–P4) within [30] minutes.
4. Page the appropriate response team per the escalation matrix.
5. Open an incident bridge call (P1/P2).
6. Begin incident log documentation (see Section 7).

### Phase 2 — Containment

**Immediate Containment Actions (within 1 hour for P1, 4 hours for P2):**

See Section 4 for platform-specific containment procedures.

General containment principles:
- Preserve evidence before making changes. Take snapshots/exports before remediation.
- Do not destroy logs. Archive affected `ledger_events` and `audit_logs` records.
- Isolate affected systems — do not simply restart or patch without investigation.
- If active attacker is present, containment takes priority over availability.

**Evidence Preservation:**
- Export `audit_logs` for the incident time window to a secure location.
- Export `ledger_events` for affected aggregates.
- Capture Redis state if session compromise suspected.
- Document all containment actions with timestamps in the incident log.

### Phase 3 — Investigation

1. Determine root cause: How did the incident occur? What controls failed?
2. Determine impact scope: Which tenants, businesses, and data records were affected?
3. Determine timeline: When did the incident begin? How long was access possible?
4. Identify attacker actions: What data was accessed, modified, or exfiltrated?
5. Document findings in the incident log.

**Key investigation queries:**

```sql
-- All audit events for a suspect user in the incident window
SELECT * FROM audit_logs
WHERE user_id = '[SUSPECT_USER_ID]'
  AND timestamp BETWEEN '[START]' AND '[END]'
ORDER BY timestamp;

-- All ledger events in the incident window
SELECT * FROM ledger_events
WHERE created_at BETWEEN '[START]' AND '[END]'
ORDER BY created_at;

-- Failed login attempts
SELECT * FROM audit_logs
WHERE action = 'auth.login.failed'
  AND timestamp BETWEEN '[START]' AND '[END]';

-- Cross-tenant access attempts
SELECT * FROM audit_logs
WHERE action LIKE '%403%' OR action = 'auth.tenant.mismatch'
  AND timestamp BETWEEN '[START]' AND '[END]';
```

### Phase 4 — Eradication

1. Remove the root cause of the incident (patch vulnerability, revoke compromised credentials, remove malware).
2. Verify the attack vector is fully closed before restoring service.
3. Reset all potentially compromised credentials.
4. Rotate encryption keys if key material may have been exposed.
5. Review related systems for lateral compromise.

### Phase 5 — Recovery

1. Restore affected systems from known-good backups if necessary.
2. Verify system integrity before bringing services back online.
3. Monitor closely for 24–72 hours post-recovery for signs of reinfection or recurring exploitation.
4. Confirm all `audit_logs` and `ledger_events` are intact and consistent.
5. Health check: `GET /api/health` must return `database: ok` and `redis: ok`.

### Phase 6 — Post-Incident Review

1. P1 and P2: Post-mortem completed within [5] business days of incident closure.
2. P3: Post-mortem or ticket follow-up within [14] business days.
3. P4: Engineering backlog item created and tracked.

---

## 4. Platform-Specific Containment Actions

### 4.1 Compromised User Account

```
1. Immediately: PATCH /api/admin/users/:userId  { isActive: false }
2. The JTI blocklist automatically invalidates existing tokens.
3. Query audit_logs for all actions taken by suspect user: last 30 days.
4. Determine if any data was accessed or exfiltrated.
5. Reset password and MFA before reactivating.
```

### 4.2 Compromised Refresh Token

```
1. The JTI of the compromised token must be added to Redis blocklist:
   SET jti:<JTI_VALUE> "revoked" EX <remaining_TTL>
2. User must re-authenticate with fresh credentials.
3. Investigate how token was exposed (logs, network capture, XSS).
```

### 4.3 Suspected Data Breach (NPI Exposure)

```
1. Declare P1 immediately. Page CISO and engage Legal Counsel.
2. Do NOT notify customers until legal counsel confirms notification requirements.
3. Isolate affected tenant if necessary: PATCH /api/admin/tenants/:id { isActive: false }
4. Preserve all audit_logs and ledger_events — do not delete.
5. Determine scope: which businesses, which fields (SSN, DOB, EIN) were exposed.
6. Document affected record count — drives regulatory notification threshold.
7. Assess GLBA 30-day notification window from discovery date.
```

### 4.4 Complete Platform Outage

```
1. Declare P1. Page DevOps, Engineering Lead, CISO.
2. Check health endpoint: GET /api/health
3. Check database connectivity: psql $DATABASE_URL -c "SELECT 1"
4. Check Redis: redis-cli -u $REDIS_URL PING
5. Check application logs in ECS / CloudWatch.
6. If database unavailable: check RDS status in AWS console.
7. If Redis unavailable: JTI blocklist is unavailable — assess risk before restoring auth.
8. Post status update to [status page] within 30 minutes of outage declaration.
```

### 4.5 Encryption Key Compromise

```
1. Declare P1 immediately. Page CISO and DevOps.
2. Rotate ENCRYPTION_KEY immediately in AWS Secrets Manager.
3. Re-deploy application with new key.
4. Execute re-encryption migration for all NPI fields.
5. Engage Legal Counsel — key compromise affecting encrypted NPI may trigger breach notification.
6. Document rotation in key rotation log.
```

### 4.6 Suspicious Outbound Communication (TCPA Consent Violation)

```
1. Check consent_records for affected businessId and channel.
2. If no active consent found: halt outbound campaign immediately.
3. Document in compliance_checks table with checkType='tcpa_violation'.
4. Log risk.alert.raised event to canonical ledger.
5. Escalate to Compliance Officer for regulatory notification assessment.
```

---

## 5. Communication Templates

### 5.1 Internal Incident Notification (P1/P2)

**To:** Incident Response Team (Bridge Call)
**Subject:** [P1/P2] Incident INC-YYYY-MM-DD-NNN — [Brief Description]

```
INCIDENT DECLARATION
====================
Incident ID:    INC-YYYY-MM-DD-NNN
Severity:       [P1 / P2]
Declared at:    [UTC TIMESTAMP]
Declared by:    [NAME]
Incident Commander: [NAME]

SUMMARY
-------
[2-3 sentence description of what happened and what is affected]

CURRENT STATUS
--------------
[Contained / Under Investigation / Eradication / Recovery]

AFFECTED SYSTEMS
----------------
[List affected services, tenants, or data]

NEXT UPDATE
-----------
[Time of next status update — every 30 min for P1, every 2 hours for P2]

BRIDGE CALL
-----------
[Meeting link / phone number]
```

### 5.2 Tenant Notification — Confirmed Breach

**To:** Affected Tenant Admin (email + in-app notification)
**Subject:** Important Security Notice — Action Required

```
Dear [TENANT NAME] Administrator,

We are writing to notify you of a security incident affecting your account on the
CapitalForge platform.

WHAT HAPPENED
On [DATE], we detected [BRIEF DESCRIPTION OF INCIDENT]. We immediately initiated
our incident response procedures.

WHAT INFORMATION WAS INVOLVED
The following types of information may have been affected for businesses within
your account:
- [LIST AFFECTED DATA TYPES]

WHAT WE ARE DOING
We have [CONTAINMENT ACTIONS TAKEN]. We have also [ADDITIONAL STEPS].

WHAT YOU SHOULD DO
1. [SPECIFIC ACTION 1]
2. [SPECIFIC ACTION 2]
3. Review your account for any unauthorized activity at: [LINK]

FOR MORE INFORMATION
Contact our compliance team at [compliance@[domain]] or [PHONE NUMBER].
Your dedicated account manager is also available to assist.

We sincerely apologize for this incident and the concern it may cause.

[SIGNATURE]
Chief Compliance Officer, CapitalForge
```

### 5.3 Regulatory Notification — GLBA FTC Notification

> Note: This template should be reviewed and finalized by legal counsel before use. GLBA Safeguards Rule (16 C.F.R. § 314.15) requires FTC notification within 30 days of discovering a breach affecting 500 or more customers.

**Filed via:** FTC Safeguards Rule Notification Form (https://www.ftc.gov/safeguards-notice)

```
Fields required by FTC Safeguards notification:
- Name and contact information of reporting financial institution
- Description of the event
- Date range of the event
- Description of the types of customer information involved
- Number of customers affected or reasonably estimated to be affected
- Whether law enforcement has been notified (and if notification would impede investigation)
- Contact information for individual at company for follow-up
```

### 5.4 Public Status Update (Availability Incident)

**Posted to:** [status.capitalforge.io]

```
[STATUS: INVESTIGATING / IDENTIFIED / MONITORING / RESOLVED]

[DATE TIME UTC] — [HEADLINE IN ONE SENTENCE]

We are currently [investigating / experiencing / monitoring] an issue affecting
[AFFECTED SERVICE / FEATURE]. [NUMBER] of our users may be experiencing
[SYMPTOMS].

Our engineering team is actively working to resolve this issue.

Next update: [TIME]
```

---

## 6. Post-Mortem Template

**Incident ID:** INC-YYYY-MM-DD-NNN
**Post-Mortem Author:** [NAME]
**Date of Incident:** [DATE]
**Date of Post-Mortem:** [DATE — within 5 business days of closure]
**Participants:** [NAMES AND ROLES]

### 6.1 Executive Summary

[3-5 sentence summary of what happened, impact, and most important lesson learned.]

### 6.2 Incident Timeline

| Time (UTC) | Event | Action Taken | By |
|-----------|-------|--------------|-----|
| HH:MM | Incident detected | [Action] | [Name] |
| HH:MM | P[N] declared | [Action] | [Name] |
| HH:MM | Incident Commander engaged | [Action] | [Name] |
| HH:MM | Containment initiated | [Action] | [Name] |
| HH:MM | Root cause identified | [Action] | [Name] |
| HH:MM | Eradication complete | [Action] | [Name] |
| HH:MM | Recovery complete | [Action] | [Name] |
| HH:MM | Incident closed | [Action] | [Name] |

### 6.3 Root Cause Analysis

**Root Cause:** [Technical or process root cause]

**Contributing Factors:**
1. [Factor 1]
2. [Factor 2]

**Why did controls not prevent this?**
[Explanation of which controls were absent, misconfigured, or bypassed]

### 6.4 Impact Assessment

| Dimension | Assessment |
|-----------|-----------|
| Tenants affected | [Count / Names] |
| Businesses affected | [Count] |
| Records potentially exposed | [Count and data types] |
| Service downtime | [Duration] |
| Regulatory notification required? | [Yes / No / Under assessment] |
| Financial impact | [Estimate if applicable] |

### 6.5 What Went Well

1. [Thing that worked as designed]
2. [Process that accelerated response]
3. [Team action that limited impact]

### 6.6 What Went Poorly

1. [Process gap that delayed response]
2. [Missing control that allowed the incident]
3. [Communication failure]

### 6.7 Action Items

| ID | Action | Owner | Due Date | Status |
|----|--------|-------|----------|--------|
| AI-001 | [Specific remediation action] | [Name] | [Date] | Open |
| AI-002 | [Control to implement] | [Name] | [Date] | Open |
| AI-003 | [Process to document] | [Name] | [Date] | Open |

### 6.8 Control Improvement Mapping

| Action Item | Related Control | TSC Reference | Controls Matrix Update Needed? |
|-------------|-----------------|---------------|-------------------------------|
| AI-001 | [Control ID] | [CC/A/PI/C/P] | Yes / No |

### 6.9 Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Incident Commander | | | |
| CISO | | | |
| Compliance Officer | | | |
| Engineering Lead | | | |

---

## 7. Incident Log

The incident log is maintained in the Document Vault under the `incident_records` document type. Each incident record must be retained for a minimum of [7] years.

**Incident register location:** Document Vault — `documentType: 'incident_record'`

**Minimum fields per incident record:**

| Field | Description |
|-------|-------------|
| `incidentId` | Unique ID: INC-YYYY-MM-DD-NNN |
| `severity` | P1 / P2 / P3 / P4 |
| `discoveredAt` | UTC timestamp of detection |
| `declaredAt` | UTC timestamp of P-level declaration |
| `containedAt` | UTC timestamp of containment |
| `resolvedAt` | UTC timestamp of incident closure |
| `rootCause` | Short root cause description |
| `affectedTenants` | Array of tenant IDs |
| `npiExposed` | Boolean — did incident involve NPI |
| `regulatoryNotificationRequired` | Boolean |
| `regulatoryNotificationSentAt` | UTC timestamp if applicable |
| `postMortemCompleted` | Boolean |
| `postMortemDocumentId` | Document Vault ID of post-mortem |

---

**Document Control**

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-31 | Engineering / Compliance Team | Initial version |

**Next Review Date:** 2027-03-31 (or after any P1/P2 incident)
