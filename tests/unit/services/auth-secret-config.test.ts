// ============================================================
// The setup file names the secrets the code actually requires
//
// `.env.example` listed `JWT_SECRET` — which nothing in this codebase reads —
// and named neither `JWT_ACCESS_SECRET` nor `JWT_REFRESH_SECRET`, the two that
// `config/auth.ts` requires and throws without.
//
// So anybody setting up from it configured a variable that did nothing, never
// learned about the two that mattered, got a server that booted cleanly, and
// hit "[auth] JWT_ACCESS_SECRET must be set and at least 32 characters long"
// at the first login. Fail-closed, so loud rather than dangerous — but a
// deployment blocker, and one nobody local would ever see, because a working
// `.env` has both.
//
// `config/index.ts` also exported `JWT_SECRET` as `config.jwt.secret`,
// degrading to the literal 'dev-secret-change-in-production' whenever
// NODE_ENV was not 'production' — and NODE_ENV itself defaults to
// 'development' in that same file. Nothing read it. A dead export is usually
// harmless; this one was a correct-looking answer to the right question,
// sitting closer to hand than the real one.
//
// These assertions are about documents rather than behaviour, which is
// unusual. They are here because nothing else checks a setup file, and the
// failure it caused is invisible to everyone who already has a working `.env`.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8');
const configSource = readFileSync(join(ROOT, 'src', 'backend', 'config', 'index.ts'), 'utf8');
const authSource = readFileSync(join(ROOT, 'src', 'backend', 'config', 'auth.ts'), 'utf8');

/** Variable names `auth.ts` demands through requireSecret(). */
function secretsRequiredByCode(): string[] {
  return [...authSource.matchAll(/requireSecret\('([A-Z_]+)'\)/g)].map((m) => m[1]!);
}

describe('.env.example names what the code requires', () => {
  const required = secretsRequiredByCode();

  it('finds the required secrets at all, so an empty pass is impossible', () => {
    // Without this the loop below vacuously passes if the parse breaks — and a
    // vacuous pass is precisely the failure this file exists to prevent.
    expect(required.length).toBeGreaterThanOrEqual(2);
    expect(required).toContain('JWT_ACCESS_SECRET');
    expect(required).toContain('JWT_REFRESH_SECRET');
  });

  it.each(required)('%s appears in .env.example', (name) => {
    expect(
      envExample.includes(`${name}=`),
      `${name} is required by config/auth.ts and absent from .env.example`,
    ).toBe(true);
  });

  it('does not name a JWT secret nothing reads', () => {
    // The specific rot: a variable an operator would dutifully set, to no
    // effect, while the two real ones went unmentioned.
    const listed = [...envExample.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]!);
    const strayJwtSecrets = listed.filter(
      (n) => n.includes('SECRET') && n.startsWith('JWT') && !required.includes(n),
    );
    expect(strayJwtSecrets, 'JWT secrets listed but read by nothing').toEqual([]);
  });
});

describe('config/index.ts exports no signing secret', () => {
  it('does not export JWT_SECRET', () => {
    // It degraded to a literal off NODE_ENV, which defaults to 'development'
    // in this same file — so an unset NODE_ENV in production selected it.
    expect(configSource).not.toMatch(/export const JWT_SECRET\b/);
  });

  it('does not surface one as config.jwt.secret', () => {
    // The reachable name is what made it dangerous rather than merely dead.
    expect(configSource).not.toMatch(/jwt:\s*\{[^}]*\bsecret:/s);
  });

  it('still exports the non-secret JWT settings', () => {
    // The fix is a deletion, and a deletion that took the expiry config with
    // it would be a different kind of wrong.
    expect(configSource).toMatch(/export const JWT_EXPIRY\b/);
    expect(configSource).toMatch(/export const REFRESH_TOKEN_EXPIRY\b/);
  });
});

describe('the real secrets are gated unconditionally', () => {
  it('does not weaken the requirement outside production', () => {
    // config/auth.ts throws regardless of NODE_ENV, which is what makes the
    // deleted export redundant as well as hazardous. A future edit adding an
    // IS_PRODUCTION check here would reintroduce exactly what was removed.
    expect(authSource).toMatch(/val\.length < 32/);
    expect(authSource).not.toMatch(/IS_PRODUCTION|NODE_ENV/);
  });
});
