'use client';

// ============================================================
// CapitalForge — imperative JSON loader
//
// `useAuthFetch` covers components that load one resource on mount. Pages
// that fetch several resources at once, or reload imperatively from an event
// handler, cannot use a hook and were hand-rolling fetch + parse. Several of
// them handled failure by substituting hardcoded sample data, which made a
// down backend, an expired session and a healthy-but-empty tenant all render
// identically — and look fine.
//
// This helper gives those call sites the same error classification the hook
// produces, so they can render a real error state instead of inventing data.
// ============================================================

import { authHeaders } from './api-client';
import { attemptTokenRefresh } from '@/hooks/useAuthFetch';
import type { AuthFetchError } from '@/hooks/useAuthFetch';

export type { AuthFetchError };

/** The API's standard response envelope. */
interface Envelope {
  success?: boolean;
  data?: unknown;
  meta?: Record<string, unknown>;
  error?: { message?: string };
}

/** Thrown by `loadJson`; `info` carries the classified error for the UI. */
export class LoadError extends Error {
  readonly info: AuthFetchError;

  constructor(info: AuthFetchError) {
    super(info.message);
    this.name = 'LoadError';
    this.info = info;
  }
}

/** Narrow an unknown catch binding to something renderable. */
export function toLoadError(error: unknown): AuthFetchError {
  if (error instanceof LoadError) return error.info;
  return { type: 'network_error', message: 'Connection issue' };
}

/** True when the response was served by an unimplemented (stub) endpoint. */
export function isStubResponse(meta: unknown): boolean {
  return typeof meta === 'object' && meta !== null && (meta as { stub?: boolean }).stub === true;
}

interface LoadOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set for endpoints that are genuinely public (no token expected). */
  allowAnonymous?: boolean;
}

/**
 * Fetch an API envelope and return its `data`, or throw a `LoadError`.
 *
 * A 401/403 triggers one token-refresh attempt before being reported as
 * `auth_required`, matching `useAuthFetch`.
 */
export async function loadJson<T>(path: string, options: LoadOptions = {}): Promise<T> {
  const { body, allowAnonymous = false, headers: extraHeaders, ...init } = options;

  const send = (): Promise<Response> =>
    fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...((extraHeaders as Record<string, string>) ?? {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response: Response;
  try {
    response = await send();
  } catch {
    throw new LoadError({ type: 'network_error', message: 'Connection issue' });
  }

  if (response.status === 401 || response.status === 403) {
    if (!allowAnonymous && (await attemptTokenRefresh())) {
      try {
        response = await send();
      } catch {
        throw new LoadError({ type: 'network_error', message: 'Connection issue' });
      }
    }
    if (response.status === 401 || response.status === 403) {
      throw new LoadError({
        type: 'auth_required',
        message: 'Sign in required',
        status: response.status,
      });
    }
  }

  let json: Envelope | null = null;
  try {
    json = (await response.json()) as Envelope;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new LoadError({
      type: 'server_error',
      message: json?.error?.message ?? `Request failed (${response.status})`,
      status: response.status,
    });
  }

  if (!json || json.success !== true) {
    throw new LoadError({
      type: 'server_error',
      message: json?.error?.message ?? 'Unexpected response from the server',
      status: response.status,
    });
  }

  return json.data as T;
}

/** As `loadJson`, but also returns the envelope's `meta` (for stub detection). */
export async function loadJsonWithMeta<T>(
  path: string,
  options: LoadOptions = {},
): Promise<{ data: T; meta: Record<string, unknown> | undefined }> {
  const { body, allowAnonymous: _allowAnonymous, headers: extraHeaders, ...init } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...((extraHeaders as Record<string, string>) ?? {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new LoadError({ type: 'network_error', message: 'Connection issue' });
  }

  if (response.status === 401 || response.status === 403) {
    throw new LoadError({
      type: 'auth_required',
      message: 'Sign in required',
      status: response.status,
    });
  }

  const json = (await response.json().catch(() => null)) as Envelope | null;

  if (!response.ok || !json || json.success !== true) {
    throw new LoadError({
      type: 'server_error',
      message: json?.error?.message ?? `Request failed (${response.status})`,
      status: response.status,
    });
  }

  return { data: json.data as T, meta: json.meta };
}
