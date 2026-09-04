// ============================================================
// The Office bridge — configuration
//
// Read LAZILY, on every call, and never given a development default.
//
// config/index.ts explains at length why a signing secret must not live there:
// that module snapshots process.env once at import time and substitutes a
// hardcoded default when a variable is absent at that instant, so a verifier
// reading the snapshot can silently end up on the dev value while the real one
// is in use elsewhere. The shared secret below has exactly that hazard, so it
// follows config/auth.ts instead — lazy reads, no fallback, a hard throw when
// absent.
//
// An absent secret must fail loudly. A brokered Forge whose adapter accepted
// `''` as its credential would authenticate every caller, and the first symptom
// would be a working system.
// ============================================================

/** Env var holding the tenant credential The Office presents as a bearer token. */
const SECRET_VAR = 'OFFICE_SHARED_SECRET';

/** Env var holding the venture -> tenant map, as `venture:tenantUuid` pairs. */
const VENTURE_MAP_VAR = 'OFFICE_VENTURE_TENANTS';

/**
 * Env var holding the user id the adapter mints internal tokens for.
 *
 * Every brokered call runs as this principal on CapitalForge's side. It is a
 * real id so that `ledger_events.payload.userId` and every `createdBy` written
 * on a brokered call name something findable, rather than a null that reads as
 * "nobody did this".
 */
const PRINCIPAL_VAR = 'OFFICE_SERVICE_PRINCIPAL_ID';

/** Env var overriding the loopback base. Only tests and unusual deployments set it. */
const LOOPBACK_VAR = 'OFFICE_LOOPBACK_BASE';

export class OfficeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeConfigError';
  }
}

function require_(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new OfficeConfigError(
      `${key} is not set. The Office bridge cannot run without it, and it has no ` +
        'default: an adapter that accepted an empty credential would authenticate ' +
        'every caller.',
    );
  }
  return value;
}

/** The tenant credential The Office brokers. Compared in constant time, never logged. */
export function officeSharedSecret(): string {
  return require_(SECRET_VAR);
}

/** Whether the bridge is configured at all. Used to decide whether to mount it. */
export function officeBridgeConfigured(): boolean {
  return (
    (process.env[SECRET_VAR] ?? '').trim() !== '' &&
    (process.env[VENTURE_MAP_VAR] ?? '').trim() !== '' &&
    (process.env[PRINCIPAL_VAR] ?? '').trim() !== ''
  );
}

/**
 * `X-Office-Venture` -> CapitalForge `tenantId`.
 *
 * The Office addresses a venture; CapitalForge is scoped by tenant. Nothing in
 * either system knows the other's identifier, so the mapping is configuration
 * and an unmapped venture is refused rather than guessed at. Guessing here would
 * put one tenant's data behind another tenant's venture, which is the single
 * worst failure this bridge can have.
 *
 * Format: `burkham-wickmont:2b7c...,other-venture:9ad1...`
 */
export function ventureTenantMap(): ReadonlyMap<string, string> {
  const raw = require_(VENTURE_MAP_VAR);
  const map = new Map<string, string>();

  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (trimmed === '') continue;

    const separator = trimmed.indexOf(':');
    if (separator <= 0 || separator === trimmed.length - 1) {
      throw new OfficeConfigError(
        `${VENTURE_MAP_VAR} entry ${JSON.stringify(trimmed)} is not "venture:tenantId".`,
      );
    }

    const venture = trimmed.slice(0, separator).trim();
    const tenantId = trimmed.slice(separator + 1).trim();

    const existing = map.get(venture);
    if (existing !== undefined && existing !== tenantId) {
      throw new OfficeConfigError(
        `${VENTURE_MAP_VAR} maps venture ${JSON.stringify(venture)} to two tenants. ` +
          'A venture resolves to one tenant or the bridge does not run.',
      );
    }
    map.set(venture, tenantId);
  }

  if (map.size === 0) {
    throw new OfficeConfigError(`${VENTURE_MAP_VAR} is set but names no ventures.`);
  }
  return map;
}

/** The user id every brokered call runs as. */
export function officeServicePrincipalId(): string {
  return require_(PRINCIPAL_VAR);
}

/**
 * Where the adapter posts CapitalForge's own requests.
 *
 * The adapter does not re-implement any endpoint. It translates The Office's
 * call shape into the request CapitalForge already serves and makes that
 * request against itself, so the ownership guard, the tenancy filter, the RBAC
 * check and the handler are all the ones a human's call goes through. There is
 * no second copy to drift.
 */
export function officeLoopbackBase(): string {
  const explicit = process.env[LOOPBACK_VAR];
  if (explicit !== undefined && explicit.trim() !== '') {
    return explicit.trim().replace(/\/+$/, '');
  }
  const port = process.env['PORT'] ?? '4000';
  return `http://127.0.0.1:${port}`;
}
