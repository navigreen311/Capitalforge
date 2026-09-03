// ============================================================
// The Office-facing surface: CapitalForge as a brokered Forge.
//
// Mounted under: /api/office
//
//   GET  /_modules        what this adapter dispatches
//   POST /:moduleId       call one module
//
// The Office never lets an agent call a Forge directly. It resolves the agent's
// grant, checks certification and revocation, injects a tenant credential the
// agent never sees, and posts to `{base_url}/{module_id}`. This file is the
// endpoint on the other end of that post.
//
//
// IT IS A TRANSLATION LAYER AND NOTHING ELSE
// ==========================================
//
// It maps The Office's call shape onto the request CapitalForge already serves,
// and returns the answer. It contains no business logic and makes no decision
// about whether the caller may act.
//
// That second point is the important one. The Office has already decided: the
// agent holds an activated grant for this module, certified for this Forge,
// unrevoked, on shift for this venture, within budget. Re-deciding any of that
// here would put a second authorization system in the path, and the two would
// disagree the first time one of them changed. Worse, it would be the copy
// nobody audits.
//
// So the only thing refused at the door is a caller who cannot present the
// tenant credential, which is authentication, not authorization.
//
//
// WHY IT CALLS CAPITALFORGE OVER HTTP INSTEAD OF CALLING THE SERVICES
// ==================================================================
//
// Every read this adapter exposes is written inline in a route handler, not in
// a service - `GET /api/clients/:clientId` is six lines of Prisma inside
// client-detail.routes.ts. There were three ways to reach them:
//
//   1. Re-implement the query here. Two copies of every read, drifting from the
//      day they are written, with the copy an agent uses being the one nobody
//      opens.
//   2. Extract seventeen handlers into services first. Correct, and a large
//      refactor of a 988-line router to land before the bridge has ever carried
//      a call.
//   3. Make the request CapitalForge already answers.
//
// This is (3). The adapter mints a short-lived internal token, posts to itself
// on the loopback interface, and passes the answer through. The ownership
// guard, the tenancy filter, the RBAC permission check and the handler are then
// literally the ones a human's call goes through - not equivalents. There is no
// second copy to drift, and every operating instruction written against those
// endpoints stays true of the brokered path by construction.
//
// The cost is one extra in-process hop per call and a request that appears
// twice in the log. Both are visible, which is the right kind of cost.
//
//
// THE INTERNAL TOKEN IS SCOPED PER MODULE, NOT PER ADAPTER
// =======================================================
//
// `ModuleSpec.permissions` is minted into the token for that call and nothing
// else. `client_read` gets `business:read`; it does not get `business:read:pii`,
// so a `client_read` call that reached `/owners` would be refused by RBAC - by
// CapitalForge's own middleware, on its own terms.
//
// Those permission sets are copied from each module's operating instruction and
// they match the guards already declared in client-detail.routes.ts. If the two
// ever disagree, the guard wins and the call fails closed.
//
//
// IF YOU ARE ADDING A MODULE
// ==========================
//
// Read `docs/forge-adapter.md` in The Office first. Three defects survived
// design review of the CRE Forge adapter and were caught only by making a real
// call, because every one of them returned a plausible 200:
//
//   - A grant below `auto_execute` never reaches the Forge at all. The client
//     library turns it into a proposal and makes no HTTP request. If this
//     adapter never sees traffic and The Office reports no error, check the tier.
//
//   - A module with no `venture_forge_manifest` row is UNDECLARED, which blocks
//     the call and opens a HIGH incident before the tier gate is reached.
//
//   - The trace header is `X-Office-Trace`, not `X-Office-Trace-Id`. A header
//     read under the wrong name does not fail - it reads as absent. The names
//     below are copied from broker/executor.py; do not infer them.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { generateAccessToken } from '../../config/auth.js';
import logger from '../../config/logger.js';
import { PERMISSIONS } from '@shared/constants/index.js';
import { eventBus } from '../../events/event-bus.js';
import {
  officeSharedSecret,
  officeServicePrincipalId,
  officeLoopbackBase,
  ventureTenantMap,
} from '../../config/office.js';

// -- The contract, copied from broker/executor.py --------------
export const HEADER_AGENT = 'x-office-agent-id';
export const HEADER_VENTURE = 'x-office-venture';
export const HEADER_TRACE = 'x-office-trace';
export const HEADER_API_VERSION = 'x-office-forge-api-version';
export const HEADER_IDEMPOTENCY = 'idempotency-key';
/** Written on every response. The Office stores it as `forge_side_ref`. */
export const HEADER_FORGE_REQUEST_ID = 'X-Forge-Request-Id';

/** The API version this adapter speaks. Pinned: `forge_registry` rejects 'latest'. */
export const API_VERSION = '1.0.0';

/** The three values `forge_module_registry.idempotency_support` accepts. */
export type IdempotencySupport = 'key' | 'natural' | 'at_most_once';

/** Role minted into the internal token. Permissions are what actually gate. */
const OFFICE_ROLE = 'office_broker';

/**
 * Mirrors `ConsentTypeSchema`. Checked here so a bad value is refused as a
 * payload error naming the legal values, rather than reaching CapitalForge and
 * coming back as a zod field error an agent cannot act on.
 *
 * The schema is still the authority - this refuses early, it does not permit.
 */
const CONSENT_TYPES = ['tcpa', 'data_sharing', 'referral', 'application', 'product_reality'];

// -- Payload errors --------------------------------------------

/** The caller's payload is unusable. 422 - the module exists, the request does not. */
class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

type Payload = Record<string, unknown>;

function requireString(payload: Payload, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PayloadError(`${key} is required and must be a non-empty string`);
  }
  return value.trim();
}

/** Path segment interpolation. Always encoded - a client id is caller-supplied. */
function seg(payload: Payload, key: string): string {
  return encodeURIComponent(requireString(payload, key));
}

// -- What a module is ------------------------------------------

interface Operation {
  /** The method CapitalForge's own route declares. */
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Builds the internal request from the payload. Throws PayloadError on bad input. */
  readonly request: (payload: Payload) => { path: string; body?: unknown };
  /** What this operation returns, for the manifest and for a reader. */
  readonly returns: string;
}

interface ModuleSpec {
  /**
   * The operating instruction in The Office, by filename.
   *
   * Every bound module has one and every manual is bound. That is checked on
   * both sides: `office-modules.test.ts` here proves each module names a manual
   * and no two share one, and The Office's `check_module_manuals.py` proves the
   * named file exists, declares this id, and that no CapitalForge manual is
   * missing from this map.
   *
   * The check here is self-attestation - this file could name a manual that does
   * not exist. The Office's half is the real one, because that is where the
   * manuals live. Same split as V4 and V28 in the Pack validator.
   */
  readonly manual: string;
  readonly manualVersion: string;
  /** Declared at the binding site. Checked below: a read module may only GET. */
  readonly isMutating: boolean;
  readonly idempotencySupport: IdempotencySupport;
  /** Minted into the internal token for a call to this module, and nothing more. */
  readonly permissions: readonly string[];
  /** `view` in the payload selects one. Omit `view` only when there is exactly one. */
  readonly operations: Readonly<Record<string, Operation>>;
}

// -- The dispatch map ------------------------------------------
//
// THE KEYS OF THIS OBJECT ARE THE SPELLING OF RECORD FOR CAPITALFORGE.
//
// `forge_module_registry.module_id`, a Business Pack's `modules_expected` and
// The Office's `broker.module_exclusions` must all use these spellings or they
// do not resolve against this Forge - and an exclusion that does not resolve is
// an endpoint that quietly becomes grantable under a second name.
//
// Where the Burkham Pack already has a workable name, the name is kept - see
// `record_consent` below. Where it does not, the Pack is what changes: it
// declares `client_lookup` for what the manuals split into `client_read`,
// `client_read_pii` and `client_read_credit`, and one name cannot address three
// grants with three different permission sets.
//
// The test is whether the name is the problem. A one-to-one rename is three
// artifacts edited to fix nothing.

const MODULES: Readonly<Record<string, ModuleSpec>> = {
  // -- client_read ---------------------------------------------
  // Six GETs under /api/clients/:clientId. None returns regulated data about a
  // natural person - that boundary is what separates this from its two
  // siblings, and it is the reason they are three modules and not one.
  client_read: {
    manual: 'capitalforge-client-read.md',
    manualVersion: '1.4',
    isMutating: false,
    idempotencySupport: 'natural',
    permissions: [PERMISSIONS.BUSINESS_READ],
    operations: {
      profile: {
        method: 'GET',
        returns: 'the business profile',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}` }),
      },
      documents: {
        method: 'GET',
        returns: 'documents in the vault for this business',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/documents` }),
      },
      acknowledgments: {
        method: 'GET',
        returns: 'product acknowledgments signed by the client',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/acknowledgments` }),
      },
      compliance: {
        method: 'GET',
        returns: 'compliance checks, with a score computed from them',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/compliance` }),
      },
      compliance_status: {
        method: 'GET',
        returns: 'the same compliance checks, without a total',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/compliance/status` }),
      },
      repayment: {
        method: 'GET',
        returns: 'active repayment plan, schedule, and cards approaching APR expiry',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/repayment` }),
      },
    },
  },

  // -- client_read_pii -----------------------------------------
  // Natural-person identifiers. A separate grant because a legal name and a date
  // of birth are not the same disclosure as a business profile.
  client_read_pii: {
    manual: 'capitalforge-client-read-pii.md',
    manualVersion: '1.4',
    isMutating: false,
    idempotencySupport: 'natural',
    permissions: [PERMISSIONS.BUSINESS_READ, PERMISSIONS.BUSINESS_READ_PII],
    operations: {
      owners: {
        method: 'GET',
        returns: 'business owners, without full SSNs',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/owners` }),
      },
      timeline: {
        method: 'GET',
        returns: 'the client event timeline',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/timeline` }),
      },
      ach_authorization: {
        method: 'GET',
        returns: 'ACH authorisation status',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/ach-authorization` }),
      },
    },
  },

  // -- client_read_credit --------------------------------------
  // Bureau-derived throughout. `compliance/bureau-report-handling-v1` governs
  // what may be done with anything this returns; reading it here does not widen
  // that.
  client_read_credit: {
    manual: 'capitalforge-client-read-credit.md',
    manualVersion: '1.4',
    isMutating: false,
    idempotencySupport: 'natural',
    permissions: [PERMISSIONS.BUSINESS_READ, PERMISSIONS.BUSINESS_READ_CREDIT],
    operations: {
      business: {
        method: 'GET',
        returns: 'business credit scores',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/credit/business` }),
      },
      personal: {
        method: 'GET',
        returns: 'personal credit scores',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/credit/personal` }),
      },
      history: {
        method: 'GET',
        returns: 'score history, for one profileType',
        // `profileType` is a REQUIRED query parameter, not an optional filter -
        // the handler 400s without it rather than defaulting to either. The
        // first version of this binding omitted it and every call answered
        // PROFILE_TYPE_REQUIRED; it was found by exercising all sixteen
        // operations against a running server, not by review.
        request: (p) => {
          const profileType = requireString(p, 'profile_type');
          if (profileType !== 'personal' && profileType !== 'business') {
            throw new PayloadError(
              `profile_type must be 'personal' or 'business', not '${profileType}'`,
            );
          }
          return {
            path:
              `/api/clients/${seg(p, 'client_id')}/credit/history` +
              `?profileType=${encodeURIComponent(profileType)}`,
          };
        },
      },
      recommendations: {
        method: 'GET',
        returns: 'recommendations from the latest pull',
        request: (p) => ({ path: `/api/clients/${seg(p, 'client_id')}/credit/recommendations` }),
      },
    },
  },

  // -- record_consent ------------------------------------------
  //
  // The Pack's spelling, kept. An earlier version of this file bound it as
  // `consent_grant` and split the re-consent email into a second module. Both
  // were withdrawn on 3 September 2026, and the reasoning is worth keeping
  // because the instinct was reasonable and still wrong.
  //
  // ON THE NAME. `record_consent` is what the Burkham Pack declares. Renaming it
  // here would have made the Pack, the registry row and the exclusion list all
  // wrong, and this adapter is naming authority - so three artifacts get edited
  // to fix nothing. A name only changes when a name is the problem.
  //
  // ON THE SPLIT. `POST /api/clients/:clientId/consent/request` emails a client
  // asking them to re-consent. It is a different act from recording a consent
  // row, and one grant covering both would let an agent authorised to file a
  // record send mail to a client instead.
  //
  // It is not bound, and splitting it into its own module was the wrong fix. A
  // module id exists so that something can be granted; this should never be
  // granted, so it needs no id. Naming it would create a registry row, a manual
  // and a grantable surface for an act nobody has decided an agent may perform.
  //
  // WHAT KEEPS IT OUT is that this module binds one operation and that operation
  // is the write to the consent table. There is no view that reaches the email,
  // and `office-adapter.test.ts` exercises every operation on every module and
  // asserts none of them builds that path.
  record_consent: {
    manual: 'capitalforge-record-consent.md',
    manualVersion: '1.2',
    isMutating: true,
    idempotencySupport: 'natural',
    permissions: [PERMISSIONS.BUSINESS_READ, PERMISSIONS.CONSENT_MANAGE],
    operations: {
      grant: {
        method: 'POST',
        returns: 'the consent record written',
        // Built against GrantConsentBodySchema, not against what a caller might
        // plausibly send. The first version of this binding invented `method`
        // and `notes` and omitted `consentType`, which the schema requires -
        // every call answered VALIDATION_ERROR. Found by making the call, the
        // same way credit/history was.
        //
        // `ipAddress` is deliberately not passed. The schema captures it
        // "server-side when possible", and a brokered call has no consenting
        // party's address to offer - the agent is not the client. Sending the
        // broker's own address would put a plausible, wrong IP on a consent
        // record that a regulator may later read as the client's.
        request: (p) => {
          const consentType = requireString(p, 'consent_type');
          if (!CONSENT_TYPES.includes(consentType)) {
            throw new PayloadError(
              `consent_type must be one of ${CONSENT_TYPES.join(', ')}, not '${consentType}'`,
            );
          }
          return {
            path: `/api/businesses/${seg(p, 'business_id')}/consent`,
            body: {
              channel: requireString(p, 'channel'),
              consentType,
              ...(typeof p['evidence_ref'] === 'string'
                ? { evidenceRef: p['evidence_ref'] }
                : {}),
              ...(p['metadata'] !== null &&
              typeof p['metadata'] === 'object' &&
              !Array.isArray(p['metadata'])
                ? { metadata: p['metadata'] }
                : {}),
            },
          };
        },
      },
    },
  },

  // -- compliance_manifest_assemble ----------------------------
  // Assembles what is on file for one business into a manifest. A read, and its
  // sibling below is not - same permission, same reader, different blast radius,
  // which is the distinction an agent holding both grants most needs.
  compliance_manifest_assemble: {
    manual: 'capitalforge-compliance-manifest-assemble.md',
    manualVersion: '1.1',
    isMutating: false,
    idempotencySupport: 'natural',
    permissions: [PERMISSIONS.COMPLIANCE_READ],
    operations: {
      assemble: {
        method: 'GET',
        returns: 'the compliance manifest for one business',
        request: (p) => ({ path: `/api/documents/export/${seg(p, 'business_id')}` }),
      },
    },
  },

  // -- regulator_dossier_export --------------------------------
  //
  // THE ONLY at_most_once MODULE BOUND HERE, and the manual says why: the export
  // leaves the building. Calling it twice is not calling it once, so The Office
  // refuses to auto-retry it and escalates to a human instead - see step 4 of the
  // call path, which checks `idempotency_support` against prior calls before the
  // Forge is touched.
  //
  // The manual also declares trust tier `propose`. That is a property of the
  // GRANT, not of the binding, so it is not stated here: a tier written beside
  // the handler would be a second place to look and the grant would still win.
  regulator_dossier_export: {
    manual: 'capitalforge-regulator-dossier-export.md',
    manualVersion: '1.1',
    isMutating: true,
    idempotencySupport: 'at_most_once',
    permissions: [PERMISSIONS.COMPLIANCE_READ],
    operations: {
      export: {
        method: 'POST',
        returns: 'the dossier assembled for one regulator inquiry',
        request: (p) => ({
          path: `/api/regulator/inquiries/${seg(p, 'inquiry_id')}/export-dossier`,
          body: {},
        }),
      },
    },
  },

  // -- scan_communication --------------------------------------
  //
  // A SCAN WRITES, and the manual is emphatic about why. It does not return
  // findings for someone to act on - it returns `contentWithDisclosures`, a
  // rewritten body, which is what would actually go out. An agent that reads
  // `violations` and ignores that field has discarded the only output that
  // changes what a client receives.
  //
  // `at_most_once`: The Office will not auto-retry it and escalates instead.
  scan_communication: {
    manual: 'capitalforge-scan-communication.md',
    manualVersion: '1.0',
    isMutating: true,
    idempotencySupport: 'at_most_once',
    permissions: [PERMISSIONS.COMPLIANCE_WRITE],
    operations: {
      scan: {
        method: 'POST',
        returns: 'violations, a risk score, and the content rewritten with disclosures',
        request: (p) => ({
          path: '/api/comm-compliance/scan',
          body: {
            advisorId: requireString(p, 'advisor_id'),
            channel: requireString(p, 'channel'),
            content: requireString(p, 'content'),
          },
        }),
      },
    },
  },

  // -- submit_application --------------------------------------
  //
  // THE PERMISSION SET HERE CONSTRAINS NOTHING, and that is worth knowing before
  // anyone relies on it.
  //
  // Every other module in this map is scoped by a token CapitalForge's own RBAC
  // middleware then enforces. `POST /api/applications/:id/submit` carries
  // `tenantMiddleware` and no `requirePermission` at all - the permission named
  // for this act, `application:submit`, is checked on a different route in a
  // different file (application.routes.ts:115), which CREATES an application.
  //
  // So `APPLICATION_SUBMIT` is declared here because it is the right permission
  // for the act and because it will take effect the day that route gains a
  // guard. Today nothing reads it. What stands between a brokered call and a
  // submitted application is the five enforced gates and the trust tier on the
  // grant - which is why the manual declares `propose` and why that tier is
  // doing real work rather than being cautious.
  //
  // See capitalforge-submit-application.md Appendix A.
  submit_application: {
    manual: 'capitalforge-submit-application.md',
    manualVersion: '1.0',
    isMutating: true,
    idempotencySupport: 'at_most_once',
    permissions: [PERMISSIONS.APPLICATION_SUBMIT],
    operations: {
      submit: {
        method: 'POST',
        returns: 'the submitted application, or the gates that refused it',
        request: (p) => ({
          path: `/api/applications/${seg(p, 'application_id')}/submit`,
          body: {
            // Maker-checker: the route refuses a submission with no approver
            // named, and will not say whether one was forgotten or misnamed.
            ...(typeof p['approved_by_user_id'] === 'string'
              ? { approvedByUserId: p['approved_by_user_id'] }
              : {}),
            // AN OBJECT KEYED BY DECLARATION ID, never an array. The route
            // refuses an array explicitly and says why: "An array of booleans
            // cannot say WHICH thing was confirmed. Positional truth is not an
            // attestation - reorder the checkboxes and the same payload attests
            // to different things."
            //
            // The first version of this binding passed `declarations` only when
            // it WAS an array, so every call answered DECLARATIONS_REQUIRED.
            // Third binding defect found by calling rather than reading.
            ...(p['declarations'] !== null &&
            typeof p['declarations'] === 'object' &&
            !Array.isArray(p['declarations'])
              ? { declarations: p['declarations'] }
              : {}),
          },
        }),
      },
    },
  },

  // -- restack_recommend ---------------------------------------
  // Three GETs. Recommends; it does not act, and nothing here starts a round.
  restack_recommend: {
    manual: 'capitalforge-restack-recommend.md',
    manualVersion: '1.1',
    isMutating: false,
    idempotencySupport: 'natural',
    permissions: [PERMISSIONS.BUSINESS_READ],
    operations: {
      check: {
        method: 'GET',
        returns: 'whether one business is a restack candidate, and why',
        request: (p) => ({ path: `/api/restack/check/${seg(p, 'business_id')}` }),
      },
      eligible: {
        method: 'GET',
        returns: 'the eligible population for this tenant',
        request: () => ({ path: '/api/restack/eligible' }),
      },
      opportunities: {
        method: 'GET',
        returns: 'the dashboard restack-opportunity list',
        request: () => ({ path: '/api/v1/dashboard/restack-opportunities' }),
      },
    },
  },
};

// -- Build-time checks on the map ------------------------------
//
// These run at import. A contradiction in the dispatch map should stop the
// process, not answer a call.

for (const [moduleId, spec] of Object.entries(MODULES)) {
  // `_modules` is the manifest. A module named with a leading underscore would
  // shadow it, and the first symptom would be a Pack that cannot be validated.
  if (moduleId.startsWith('_')) {
    throw new Error(`office adapter: '${moduleId}' may not start with an underscore`);
  }

  const operations = Object.entries(spec.operations);
  if (operations.length === 0) {
    throw new Error(`office adapter: '${moduleId}' binds no operations`);
  }

  // THE MUTATION GUARD, and it is static rather than runtime.
  //
  // The CRE adapter checks this at runtime by asking SQLAlchemy whether the
  // session was dirtied. Prisma has no session to interrogate, so the same check
  // there would need a client extension and a per-request flag - more machinery,
  // answering later.
  //
  // Here the question is decidable without running anything: this adapter reaches
  // CapitalForge only through the operations below, so a module that declares
  // itself a read and maps to a non-GET is a contradiction visible in the file.
  // Stronger than the runtime check, and it fails at import rather than on the
  // call that would have done the writing.
  if (!spec.isMutating) {
    for (const [view, operation] of operations) {
      if (operation.method !== 'GET') {
        throw new Error(
          `office adapter: '${moduleId}' declares is_mutating=false but its ` +
            `'${view}' operation is a ${operation.method}`,
        );
      }
    }
    if (spec.idempotencySupport !== 'natural') {
      throw new Error(
        `office adapter: '${moduleId}' reads, so calling it twice cannot differ - ` +
          `idempotency_support must be 'natural', not '${spec.idempotencySupport}'`,
      );
    }
  }

  if (spec.manual.trim() === '' || spec.manualVersion.trim() === '') {
    throw new Error(`office adapter: '${moduleId}' names no operating instruction`);
  }
  if (spec.permissions.length === 0) {
    throw new Error(`office adapter: '${moduleId}' declares no permissions`);
  }
}

{
  const seen = new Map<string, string>();
  for (const [moduleId, spec] of Object.entries(MODULES)) {
    const other = seen.get(spec.manual);
    if (other !== undefined) {
      throw new Error(
        `office adapter: '${moduleId}' and '${other}' both claim ${spec.manual}. ` +
          'One manual describes one module.',
      );
    }
    seen.set(spec.manual, moduleId);
  }
}

// -- Exported for the tests and for the manual cross-check -----
export const moduleIds = (): string[] => Object.keys(MODULES).sort();
export const moduleManuals = (): Record<string, string> =>
  Object.fromEntries(Object.entries(MODULES).map(([id, spec]) => [id, spec.manual]));

// -- Authentication --------------------------------------------

function presentedSecret(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token === '' ? null : token;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.trim() !== '') return apiKey.trim();
  return null;
}

/**
 * Constant-time comparison of the presented credential against the configured one.
 *
 * Both sides are padded to a common width because `timingSafeEqual` throws on a
 * length mismatch, and a thrown comparison is a length oracle. The length
 * equality is folded into the result rather than returned early for the same
 * reason.
 */
function authenticated(req: Request): boolean {
  const presented = presentedSecret(req);
  if (presented === null) return false;

  const expected = officeSharedSecret();
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  const width = Math.max(a.length, b.length);
  const padA = Buffer.alloc(width);
  const padB = Buffer.alloc(width);
  a.copy(padA);
  b.copy(padB);
  return timingSafeEqual(padA, padB) && a.length === b.length;
}

// -- The identity The Office stamps ----------------------------

interface OfficeIdentity {
  agentId: string | null;
  venture: string | null;
  trace: string | null;
  apiVersion: string | null;
  idempotencyKey: string | null;
}

function identity(req: Request): OfficeIdentity {
  const one = (name: string): string | null => {
    const value = req.headers[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };
  return {
    agentId: one(HEADER_AGENT),
    venture: one(HEADER_VENTURE),
    trace: one(HEADER_TRACE),
    apiVersion: one(HEADER_API_VERSION),
    idempotencyKey: one(HEADER_IDEMPOTENCY),
  };
}

// -- The inner call --------------------------------------------

export interface InnerRequest {
  method: string;
  path: string;
  token: string;
  body?: unknown;
  traceId: string | null;
}

export interface InnerResponse {
  status: number;
  body: unknown;
}

/**
 * How the adapter reaches CapitalForge. Injectable so tests can drive the
 * dispatch map without a listening socket.
 */
export type InnerCaller = (request: InnerRequest) => Promise<InnerResponse>;

const loopbackCaller: InnerCaller = async (request) => {
  const url = `${officeLoopbackBase()}${request.path}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${request.token}`,
    accept: 'application/json',
  };
  if (request.body !== undefined) headers['content-type'] = 'application/json';
  // Carried through so one trace id spans The Office's ledger row, this
  // adapter's ledger row, and CapitalForge's own request log.
  if (request.traceId !== null) headers['x-request-id'] = request.traceId;

  const response = await fetch(url, {
    method: request.method,
    headers,
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });

  let body: unknown;
  const text = await response.text();
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
};

let innerCaller: InnerCaller = loopbackCaller;

/** Test seam. Returns the previous caller so a test can restore it. */
export function setInnerCaller(caller: InnerCaller): InnerCaller {
  const previous = innerCaller;
  innerCaller = caller;
  return previous;
}

// -- The router ------------------------------------------------

export const officeRouter = Router();

officeRouter.use((req: Request, res: Response, next): void => {
  if (authenticated(req)) {
    next();
    return;
  }
  res.setHeader(HEADER_FORGE_REQUEST_ID, randomUUID());
  res.status(401).json({
    success: false,
    error: {
      code: 'OFFICE_CREDENTIAL_REJECTED',
      message: 'This surface is reached with the tenant credential The Office brokers.',
    },
  });
});

/**
 * What this adapter dispatches.
 *
 * THE ONLY THING ON THIS SIDE THAT IS NOT A DECLARATION.
 *
 * `forge_module_registry` is rows a human wrote. A Pack's `modules_expected` is
 * a list a human wrote. Comparing those two compares two claims and finds a
 * typo. This is derived by iterating the dispatch map: a name is in the answer
 * if and only if a handler is bound to it. You cannot add the name without
 * adding the function, and you cannot delete the function and keep the name.
 *
 * NEVER REPLACE THIS WITH A LITERAL LIST. A list maintained beside the map is a
 * third declaration and a worse one than the two that exist, because it would
 * drift silently while carrying the authority of having come from the Forge.
 * `office-modules.test.ts` fails the build if it does.
 *
 * `is_mutating` and `idempotency_support` are weaker than the name: they are
 * declared at the binding site rather than derived. They are checked rather
 * than trusted - the loop above refuses at import a read-declared module that
 * maps to anything but a GET.
 */
officeRouter.get('/_modules', (_req: Request, res: Response): void => {
  res.setHeader(HEADER_FORGE_REQUEST_ID, randomUUID());
  res.json({
    forge_id: 'capitalforge',
    api_version: API_VERSION,
    modules: Object.entries(MODULES)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moduleId, spec]) => ({
        module_id: moduleId,
        is_mutating: spec.isMutating,
        idempotency_support: spec.idempotencySupport,
        // Read by The Office's checker to prove the manual set and the bound set
        // are the same set. Extra keys are ignored by older readers.
        manual: spec.manual,
        manual_version: spec.manualVersion,
        permissions: [...spec.permissions],
        operations: Object.keys(spec.operations).sort(),
      })),
  });
});

officeRouter.post('/:moduleId', async (req: Request, res: Response): Promise<void> => {
  const forgeRequestId = randomUUID();
  res.setHeader(HEADER_FORGE_REQUEST_ID, forgeRequestId);

  const started = Date.now();
  const moduleId = req.params['moduleId'] ?? '';
  const who = identity(req);

  const fail = (status: number, code: string, message: string): void => {
    logger.warn('Office call refused', { moduleId, code, forgeRequestId, trace: who.trace });
    res.status(status).json({ success: false, error: { code, message } });
  };

  const spec = MODULES[moduleId];
  if (spec === undefined) {
    fail(
      404,
      'MODULE_NOT_BOUND',
      `CapitalForge dispatches no module '${moduleId}'. GET /_modules lists what it does.`,
    );
    return;
  }

  if (who.venture === null) {
    fail(400, 'VENTURE_HEADER_MISSING', `${HEADER_VENTURE} is required.`);
    return;
  }

  let tenantId: string | undefined;
  try {
    tenantId = ventureTenantMap().get(who.venture);
  } catch (error) {
    logger.error('Office venture map unreadable', { error, forgeRequestId });
    fail(503, 'OFFICE_BRIDGE_MISCONFIGURED', 'The venture-to-tenant map is unreadable.');
    return;
  }
  if (tenantId === undefined) {
    // Refused, never guessed. Picking a tenant for an unmapped venture would put
    // one tenant's records behind another tenant's venture, which is the worst
    // failure this bridge can have.
    fail(403, 'VENTURE_NOT_MAPPED', `Venture '${who.venture}' maps to no CapitalForge tenant.`);
    return;
  }

  const payload: Payload =
    req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Payload)
      : {};

  const views = Object.keys(spec.operations);
  let view: string;
  if (typeof payload['view'] === 'string' && payload['view'].trim() !== '') {
    view = payload['view'].trim();
  } else if (views.length === 1) {
    // Not a default. There is exactly one thing this could mean.
    view = views[0]!;
  } else {
    fail(
      422,
      'VIEW_REQUIRED',
      `'${moduleId}' has ${views.length} operations, so 'view' must say which: ` +
        `${[...views].sort().join(', ')}.`,
    );
    return;
  }

  const operation = spec.operations[view];
  if (operation === undefined) {
    fail(
      422,
      'VIEW_NOT_BOUND',
      `'${moduleId}' has no operation '${view}'. It has: ${[...views].sort().join(', ')}.`,
    );
    return;
  }

  let inner: { path: string; body?: unknown };
  try {
    inner = operation.request(payload);
  } catch (error) {
    if (error instanceof PayloadError) {
      fail(422, 'PAYLOAD_INVALID', error.message);
      return;
    }
    throw error;
  }

  // Belt and braces against the import-time check above: if a read-declared
  // module ever reached a non-GET, this refuses before the request is made.
  if (!spec.isMutating && operation.method !== 'GET') {
    logger.error('Office adapter contradiction reached at runtime', { moduleId, view });
    fail(
      500,
      'READ_MODULE_WOULD_WRITE',
      `'${moduleId}' is declared a read and '${view}' is a ${operation.method}.`,
    );
    return;
  }

  let token: string;
  try {
    token = await generateAccessToken({
      userId: officeServicePrincipalId(),
      tenantId,
      role: OFFICE_ROLE,
      permissions: [...spec.permissions],
    });
  } catch (error) {
    logger.error('Office internal token could not be minted', { error, forgeRequestId });
    fail(503, 'OFFICE_BRIDGE_MISCONFIGURED', 'The bridge could not authenticate itself.');
    return;
  }

  let answer: InnerResponse;
  try {
    answer = await innerCaller({
      method: operation.method,
      path: inner.path,
      token,
      traceId: who.trace,
      ...(inner.body === undefined ? {} : { body: inner.body }),
    });
  } catch (error) {
    logger.error('Office inner call failed', { moduleId, view, error, forgeRequestId });
    fail(502, 'INNER_CALL_FAILED', 'CapitalForge did not answer its own request.');
    return;
  }

  // -- The record on this side ---------------------------------
  //
  // One row per brokered call, whatever the module does. The Office writes an
  // `agent_call_ledger` row and this writes a `ledger_events` row, and
  // `aggregateId` is the trace id both carry, so the two join.
  //
  // WRITTEN FOR READS TOO, and that is deliberate. capitalforge-client-read.md
  // section 2 says the module records nothing, "including no record that the
  // read happened" - true of a human's call through the UI, and it must not stay
  // true of an autonomous agent reading a client's file. An access record is not
  // a business event; the module still writes nothing of its own. The manual
  // needs a sentence saying so, and its appendix has one.
  try {
    await eventBus.publishAndPersist(tenantId, {
      eventType: 'office.module.called',
      aggregateType: 'office_call',
      aggregateId: who.trace ?? forgeRequestId,
      payload: {
        moduleId,
        view,
        method: operation.method,
        path: inner.path,
        status: answer.status,
        officeAgentId: who.agentId,
        venture: who.venture,
        traceId: who.trace,
        idempotencyKey: who.idempotencyKey,
        forgeRequestId,
        durationMs: Date.now() - started,
      },
      metadata: {
        adapterApiVersion: API_VERSION,
        officeApiVersion: who.apiVersion,
        manual: spec.manual,
        manualVersion: spec.manualVersion,
      },
    });
  } catch (error) {
    // The call happened. Losing the record of it is bad; pretending the call
    // failed is worse - The Office would retry a write that already landed.
    logger.error('Office call not recorded in the ledger', { moduleId, error, forgeRequestId });
  }

  logger.info('Office call served', {
    moduleId,
    view,
    status: answer.status,
    officeAgentId: who.agentId,
    venture: who.venture,
    trace: who.trace,
    forgeRequestId,
    durationMs: Date.now() - started,
  });

  res.status(answer.status).json(answer.body);
});
