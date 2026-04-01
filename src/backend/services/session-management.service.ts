// ============================================================
// CapitalForge — Session Management Service
// Concurrent session limiting (max 3), invalidation on password
// change, IP-based anomaly detection, device fingerprint tracking.
// Backed by an in-memory store; swap SessionStore for Redis/Prisma.
// ============================================================

import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ── Constants ────────────────────────────────────────────────

export const MAX_CONCURRENT_SESSIONS = 3;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
export const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;  // 30 min idle

// ── Types ────────────────────────────────────────────────────

export interface SessionRecord {
  sessionId: string;
  userId: string;
  tenantId: string;
  /** Unix epoch (ms) when the session was created. */
  createdAt: number;
  /** Unix epoch (ms) of last activity. */
  lastActivityAt: number;
  /** IP address at session creation time. */
  creationIp: string;
  /** IP address of the most recent request. */
  lastSeenIp: string;
  /** Opaque device fingerprint (UA + screen / canvas hash). */
  deviceFingerprint: string;
  /** Whether the session has been explicitly invalidated. */
  revoked: boolean;
  /** Nonce used for CSRF double-submit validation. */
  csrfToken: string;
}

export interface CreateSessionOptions {
  userId: string;
  tenantId: string;
  ip: string;
  deviceFingerprint: string;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: SessionRecord;
  reason?: 'not_found' | 'revoked' | 'expired' | 'ip_anomaly';
}

export interface IPAnomalyEvent {
  userId: string;
  sessionId: string;
  previousIp: string;
  newIp: string;
  detectedAt: number;
}

// ── Session store interface ───────────────────────────────────

/**
 * Minimal async key-value store contract.
 * Swap with a Redis or Prisma implementation for distributed deploys.
 */
export interface SessionStore {
  get(sessionId: string): Promise<SessionRecord | null>;
  set(sessionId: string, session: SessionRecord): Promise<void>;
  delete(sessionId: string): Promise<void>;
  /** Returns all sessions for `userId`, including revoked. */
  getByUser(userId: string): Promise<SessionRecord[]>;
  /** Atomically lists session ids for user count checks. */
  countActive(userId: string): Promise<number>;
}

// ── In-memory session store (default) ────────────────────────

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async get(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(sessionId: string, session: SessionRecord): Promise<void> {
    this.sessions.set(sessionId, session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getByUser(userId: string): Promise<SessionRecord[]> {
    const results: SessionRecord[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) results.push(session);
    }
    return results;
  }

  async countActive(userId: string): Promise<number> {
    let count = 0;
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        !session.revoked &&
        now - session.lastActivityAt < SESSION_IDLE_TTL_MS &&
        now - session.createdAt < SESSION_TTL_MS
      ) {
        count++;
      }
    }
    return count;
  }

  /** Test helper — clear all sessions. */
  clear(): void {
    this.sessions.clear();
  }

  /** Expose size for assertions. */
  get size(): number {
    return this.sessions.size;
  }
}

// ── Anomaly event emitter ─────────────────────────────────────

type AnomalyHandler = (event: IPAnomalyEvent) => void;

// ── Session Management Service ────────────────────────────────

export class SessionManagementService {
  private readonly store: SessionStore;
  private readonly anomalyHandlers: AnomalyHandler[] = [];

  constructor(store?: SessionStore) {
    this.store = store ?? new InMemorySessionStore();
  }

  // ── Event subscription ──────────────────────────────────

  /** Subscribe to IP anomaly detection events. */
  onIPAnomaly(handler: AnomalyHandler): void {
    this.anomalyHandlers.push(handler);
  }

  private emitAnomaly(event: IPAnomalyEvent): void {
    for (const handler of this.anomalyHandlers) {
      try {
        handler(event);
      } catch {
        // Never let an anomaly handler crash the request pipeline
      }
    }
  }

  // ── Session creation ────────────────────────────────────

  /**
   * Creates a new session for the user.
   *
   * If the user already has `MAX_CONCURRENT_SESSIONS` active sessions,
   * the oldest (by `lastActivityAt`) is evicted before creating the new one.
   */
  async createSession(opts: CreateSessionOptions): Promise<SessionRecord> {
    const now = Date.now();
    const activeCount = await this.store.countActive(opts.userId);

    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      await this.evictOldestSession(opts.userId);
    }

    const session: SessionRecord = {
      sessionId: uuidv4(),
      userId: opts.userId,
      tenantId: opts.tenantId,
      createdAt: now,
      lastActivityAt: now,
      creationIp: opts.ip,
      lastSeenIp: opts.ip,
      deviceFingerprint: opts.deviceFingerprint,
      revoked: false,
      csrfToken: randomBytes(32).toString('hex'),
    };

    await this.store.set(session.sessionId, session);
    return session;
  }

  // ── Session validation ──────────────────────────────────

  /**
   * Validates a session by ID and updates `lastActivityAt` + `lastSeenIp`.
   * Fires an IP anomaly event when the request comes from a new IP.
   */
  async validateSession(
    sessionId: string,
    currentIp: string,
  ): Promise<SessionValidationResult> {
    const session = await this.store.get(sessionId);

    if (!session) {
      return { valid: false, reason: 'not_found' };
    }

    if (session.revoked) {
      return { valid: false, reason: 'revoked' };
    }

    const now = Date.now();

    if (now - session.createdAt >= SESSION_TTL_MS) {
      await this.revokeSession(sessionId);
      return { valid: false, reason: 'expired' };
    }

    if (now - session.lastActivityAt >= SESSION_IDLE_TTL_MS) {
      await this.revokeSession(sessionId);
      return { valid: false, reason: 'expired' };
    }

    // ── IP anomaly detection ──────────────────────────
    const ipChanged = session.lastSeenIp !== currentIp;
    if (ipChanged) {
      this.emitAnomaly({
        userId: session.userId,
        sessionId,
        previousIp: session.lastSeenIp,
        newIp: currentIp,
        detectedAt: now,
      });
    }

    // Update activity regardless of IP change (alert but don't block)
    const updated: SessionRecord = {
      ...session,
      lastActivityAt: now,
      lastSeenIp: currentIp,
    };
    await this.store.set(sessionId, updated);

    return { valid: true, session: updated };
  }

  // ── Session revocation ──────────────────────────────────

  /** Revokes a single session immediately. */
  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session) return;
    await this.store.set(sessionId, { ...session, revoked: true });
  }

  /**
   * Revokes ALL active sessions for a user.
   * Called on password change, account lock, or forced logout.
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const sessions = await this.store.getByUser(userId);
    let count = 0;

    for (const session of sessions) {
      if (!session.revoked) {
        await this.store.set(session.sessionId, { ...session, revoked: true });
        count++;
      }
    }

    return count;
  }

  /**
   * Revokes all sessions for a user except the one specified.
   * Useful for "log out all other devices" UX.
   */
  async revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
    const sessions = await this.store.getByUser(userId);
    let count = 0;

    for (const session of sessions) {
      if (session.sessionId !== keepSessionId && !session.revoked) {
        await this.store.set(session.sessionId, { ...session, revoked: true });
        count++;
      }
    }

    return count;
  }

  // ── Password-change invalidation ────────────────────────

  /**
   * Must be called whenever a user's password changes.
   * Revokes all existing sessions to force re-authentication.
   */
  async invalidateOnPasswordChange(userId: string): Promise<number> {
    return this.revokeAllUserSessions(userId);
  }

  // ── Device fingerprint helpers ──────────────────────────

  /**
   * Returns all unique device fingerprints seen for a user's
   * active sessions. Used for trust-device UX flows.
   */
  async getKnownDevices(userId: string): Promise<string[]> {
    const sessions = await this.store.getByUser(userId);
    const seen = new Set<string>();
    for (const session of sessions) {
      if (!session.revoked) {
        seen.add(session.deviceFingerprint);
      }
    }
    return Array.from(seen);
  }

  /** Returns `true` if the device fingerprint is associated with an
   * existing active session for this user. */
  async isKnownDevice(userId: string, fingerprint: string): Promise<boolean> {
    const devices = await this.getKnownDevices(userId);
    return devices.includes(fingerprint);
  }

  // ── CSRF token validation ───────────────────────────────

  /**
   * Validates that the supplied CSRF token matches the session's
   * stored token. Used alongside the double-submit cookie pattern.
   */
  async validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session || session.revoked) return false;
    return session.csrfToken === token;
  }

  // ── Active session listing ──────────────────────────────

  /** Returns all active (non-revoked, non-expired) sessions for a user. */
  async getActiveSessions(userId: string): Promise<SessionRecord[]> {
    const sessions = await this.store.getByUser(userId);
    const now = Date.now();

    return sessions.filter(
      (s) =>
        !s.revoked &&
        now - s.createdAt < SESSION_TTL_MS &&
        now - s.lastActivityAt < SESSION_IDLE_TTL_MS,
    );
  }

  // ── Private helpers ─────────────────────────────────────

  private async evictOldestSession(userId: string): Promise<void> {
    const sessions = await this.store.getByUser(userId);
    const active = sessions.filter((s) => !s.revoked);

    if (active.length === 0) return;

    // Sort ascending by lastActivityAt — oldest first
    active.sort((a, b) => a.lastActivityAt - b.lastActivityAt);
    await this.revokeSession(active[0]!.sessionId);
  }
}

// ── Default singleton ─────────────────────────────────────────

export const sessionService = new SessionManagementService();
